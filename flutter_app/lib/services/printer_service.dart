import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:printing/printing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';
import '../theme.dart';

/// 58mm receipt printing for the guard station.
///
/// Android / iOS: prints straight to a paired Bluetooth ESC/POS printer,
/// and reconnects to the last printer automatically.
/// Web / desktop: opens the system print dialog with a 58mm roll layout.
class PrinterService extends ChangeNotifier {
  static const _lastPrinterKey = 'last_printer_mac';
  static const _lastPrinterNameKey = 'last_printer_name';

  String? connectedName;
  bool get isConnected => connectedName != null;

  bool get bluetoothSupported =>
      !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  Future<bool> _ensurePermissions() async {
    if (defaultTargetPlatform != TargetPlatform.android) return true;
    final results = await [Permission.bluetoothConnect, Permission.bluetoothScan].request();
    // Android 11 and older have no runtime Bluetooth permission: those report as granted / restricted
    return results.values.every((s) => s.isGranted || s.isLimited || s.isRestricted);
  }

  /// Printers already paired in the phone's Bluetooth settings.
  Future<List<BluetoothInfo>> pairedPrinters() async {
    if (!bluetoothSupported) return const [];
    if (!await _ensurePermissions()) {
      throw Exception('Bluetooth permission is needed to use the receipt printer.');
    }
    if (!await PrintBluetoothThermal.bluetoothEnabled) {
      throw Exception('Bluetooth is off. Turn it on in the phone settings.');
    }
    return PrintBluetoothThermal.pairedBluetooths;
  }

  Future<void> connect(BluetoothInfo printer) async {
    final ok = await PrintBluetoothThermal.connect(macPrinterAddress: printer.macAdress);
    if (!ok) throw Exception('Could not connect to ${printer.name}. Make sure it is on and nearby.');
    connectedName = printer.name.isEmpty ? 'Printer' : printer.name;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastPrinterKey, printer.macAdress);
    await prefs.setString(_lastPrinterNameKey, connectedName!);
    notifyListeners();
  }

  /// Plug and play: reconnects to the printer used last time, if it is on.
  Future<void> reconnectLast() async {
    if (!bluetoothSupported || isConnected) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final mac = prefs.getString(_lastPrinterKey);
      if (mac == null || !await _ensurePermissions()) return;
      if (await PrintBluetoothThermal.connectionStatus) {
        connectedName = prefs.getString(_lastPrinterNameKey) ?? 'Printer';
      } else if (await PrintBluetoothThermal.connect(macPrinterAddress: mac)) {
        connectedName = prefs.getString(_lastPrinterNameKey) ?? 'Printer';
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> disconnect() async {
    if (bluetoothSupported) await PrintBluetoothThermal.disconnect;
    connectedName = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_lastPrinterKey);
    notifyListeners();
  }

  /// Prints over Bluetooth. Returns false when no printer is connected, so the
  /// caller can offer the print dialog instead.
  Future<bool> printBluetooth(IssuedTicket ticket) async {
    if (!bluetoothSupported || !isConnected) return false;
    if (!await PrintBluetoothThermal.connectionStatus) {
      connectedName = null;
      notifyListeners();
      await reconnectLast();
      if (!isConnected) return false;
    }
    return PrintBluetoothThermal.writeBytes(buildEscPos(ticket));
  }

  /// System print dialog, laid out for 58mm roll paper.
  Future<void> printWithDialog(IssuedTicket ticket) async {
    final logo = await rootBundle.load('assets/images/logo.png');
    await Printing.layoutPdf(
      name: 'Ticket ${ticket.queueNumber}',
      format: PdfPageFormat.roll57,
      onLayout: (format) => _buildPdf(ticket, format, logo.buffer.asUint8List()),
    );
  }

  /// ESC/POS bytes for a 58mm printer (32 characters per line).
  static Uint8List buildEscPos(IssuedTicket t) {
    final b = BytesBuilder();
    void cmd(List<int> bytes) => b.add(bytes);
    // Printers only know plain ASCII here; anything else becomes '?'
    void text(String s) => b.add(latin1.encode(String.fromCharCodes(s.runes.map((r) => r < 128 ? r : 63))));
    final line = '${'-' * 32}\n';

    cmd([0x1B, 0x40]); // initialise
    cmd([0x1B, 0x61, 0x01]); // centre
    cmd([0x1B, 0x45, 0x01]); // bold on
    text('${t.officeName}\n');
    cmd([0x1B, 0x45, 0x00]); // bold off
    text(line);
    text('${QueueMeta.of(t.queueType).label.toUpperCase()} QUEUE\n\n');
    cmd([0x1D, 0x21, 0x22]); // double width + height
    cmd([0x1B, 0x45, 0x01]);
    text(' ${t.queueNumber} \n\n');
    cmd([0x1D, 0x21, 0x00]); // normal size
    cmd([0x1B, 0x45, 0x00]);
    text(line);
    text('Please wait for your number\nto be called on display.\n\n');
    text('Date: ${t.dateFormatted}  Time: ${t.timeFormatted}\n');
    text('${'=' * 32}\n\n\n\n');
    cmd([0x1D, 0x56, 0x42, 0x00]); // cut
    return b.toBytes();
  }

  static Future<Uint8List> _buildPdf(IssuedTicket t, PdfPageFormat format, Uint8List logo) async {
    final doc = pw.Document();
    final small = const pw.TextStyle(fontSize: 8);
    doc.addPage(pw.Page(
      pageFormat: format.copyWith(marginLeft: 6, marginRight: 6, marginTop: 8, marginBottom: 8),
      build: (_) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        mainAxisSize: pw.MainAxisSize.min,
        children: [
          pw.Image(pw.MemoryImage(logo), width: 40, height: 40),
          pw.SizedBox(height: 4),
          pw.Text(t.officeName, textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
          pw.Divider(borderStyle: pw.BorderStyle.dashed, thickness: 0.5),
          pw.Text('${QueueMeta.of(t.queueType).label.toUpperCase()} QUEUE',
              style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 6),
          pw.Text(t.queueNumber, style: pw.TextStyle(fontSize: 28, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 6),
          pw.Divider(borderStyle: pw.BorderStyle.dashed, thickness: 0.5),
          pw.Text('Please wait for your number.\nWatch the public display.', textAlign: pw.TextAlign.center, style: small),
          pw.SizedBox(height: 4),
          pw.Text('Date: ${t.dateFormatted}', style: small),
          pw.Text('Time: ${t.timeFormatted}', style: small),
        ],
      ),
    ));
    return doc.save();
  }
}
