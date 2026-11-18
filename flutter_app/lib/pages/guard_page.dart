import 'package:flutter/material.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import '../app_scope.dart';
import '../models.dart';
import '../services/errors.dart';
import '../theme.dart';
import '../widgets/common.dart';

class GuardPage extends StatefulWidget {
  const GuardPage({super.key});

  @override
  State<GuardPage> createState() => _GuardPageState();
}

class _GuardPageState extends State<GuardPage> {
  bool _issuing = false;
  bool _showLine = false;
  String? _voidNotice;
  final List<IssuedTicket> _issued = [];

  Future<void> _issue(QueueType q) async {
    if (_issuing) return;
    final app = AppScope.of(context);
    setState(() => _issuing = true);
    try {
      final ticket = await app.queue.generateTicket(q);
      if (!mounted) return;
      setState(() {
        _voidNotice = null;
        _issued.insert(0, ticket);
        if (_issued.length > 6) _issued.removeLast();
      });

      // Bluetooth printer connected: print straight away. Otherwise show the
      // ticket and offer the print dialog.
      var printed = false;
      try {
        printed = await app.printer.printBluetooth(ticket);
      } catch (_) {}
      if (!mounted) return;
      await _showTicket(ticket, printed);
    } catch (e) {
      if (mounted) showMessage(context, 'Could not issue ticket: $e', error: true);
    } finally {
      if (mounted) setState(() => _issuing = false);
    }
  }

  Future<void> _showTicket(IssuedTicket ticket, bool printed) async {
    final app = AppScope.of(context);
    final meta = QueueMeta.of(ticket.queueType);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(printed ? 'Ticket printed' : 'Ticket issued', textAlign: TextAlign.center),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            QueueChip(ticket.queueType),
            const SizedBox(height: 8),
            Text(ticket.queueNumber,
                style: ticketNumberStyle.copyWith(fontSize: 64, color: meta.text)),
            Text('${ticket.dateFormatted}  ${ticket.timeFormatted}',
                style: const TextStyle(color: AppColors.slate500)),
          ],
        ),
        actionsAlignment: MainAxisAlignment.center,
        actionsOverflowButtonSpacing: 8,
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              _void(ticket);
            },
            style: TextButton.styleFrom(foregroundColor: AppColors.red),
            child: const Text('Void'),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.print_outlined),
            label: Text(printed ? 'Print again' : 'Print'),
            onPressed: () async {
              try {
                final ok = await app.printer.printBluetooth(ticket);
                if (!ok) await app.printer.printWithDialog(ticket);
              } catch (e) {
                if (dialogContext.mounted) showMessage(dialogContext, 'Print failed: $e', error: true);
              }
            },
          ),
          FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done')),
        ],
      ),
    );
  }

  Future<void> _void(IssuedTicket ticket) async {
    final app = AppScope.of(context);
    try {
      final rolledBack = await app.queue.voidTicket(ticket.id);
      if (!mounted) return;
      setState(() {
        _issued.removeWhere((t) => t.id == ticket.id);
        _voidNotice = rolledBack
            ? '${ticket.queueNumber} voided. That number will be issued again to the next customer.'
            : '${ticket.queueNumber} voided.';
      });
    } catch (e) {
      if (mounted) showMessage(context, 'Could not void ticket: $e', error: true);
    }
  }

  Future<void> _reset() async {
    final app = AppScope.of(context);
    final ok = await confirm(
      context,
      title: 'Start a new day?',
      message: 'Everyone still waiting or at a counter will be cancelled, and numbers restart at 001. This cannot be undone.',
      confirmLabel: 'Reset numbers',
      danger: true,
    );
    if (!ok) return;
    try {
      await app.queue.resetDaily();
      if (mounted) {
        setState(() => _issued.clear());
        showMessage(context, 'Numbers reset to 001 for the day.');
      }
    } catch (e) {
      if (mounted) showMessage(context, 'Reset failed: $e', error: true);
    }
  }

  Future<void> _pickPrinter() async {
    final app = AppScope.of(context);
    if (!app.printer.bluetoothSupported) {
      showMessage(context, 'Bluetooth printers work in the Android and iPhone apps. Here, tickets use the print dialog.');
      return;
    }
    if (app.printer.isConnected) {
      final disconnect = await confirm(
        context,
        title: app.printer.connectedName!,
        message: 'This printer is connected.',
        confirmLabel: 'Disconnect',
      );
      if (disconnect) await app.printer.disconnect();
      return;
    }
    try {
      final printers = await app.printer.pairedPrinters();
      if (!mounted) return;
      if (printers.isEmpty) {
        showMessage(context, 'No paired printers. Pair the 58mm printer in the phone\'s Bluetooth settings first.');
        return;
      }
      final choice = await showModalBottomSheet<BluetoothInfo>(
        context: context,
        builder: (_) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(title: Text('Choose the receipt printer', style: TextStyle(fontWeight: FontWeight.w700))),
              for (final p in printers)
                ListTile(
                  leading: const Icon(Icons.print_outlined),
                  title: Text(p.name.isEmpty ? 'Unnamed printer' : p.name),
                  subtitle: Text(p.macAdress),
                  onTap: () => Navigator.pop(context, p),
                ),
            ],
          ),
        ),
      );
      if (choice == null) return;
      await app.printer.connect(choice);
      if (mounted) showMessage(context, '${choice.name} connected.');
    } catch (e) {
      if (mounted) showMessage(context, friendlyError(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([app.queue, app.printer]),
      builder: (context, _) {
        final snap = app.queue.snapshot;
        final waitingIds = snap.waitingTickets.map((t) => t.id).toSet();
        return StationScaffold(
          title: 'Issue a ticket',
          actions: [
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              icon: Icon(app.printer.isConnected ? Icons.bluetooth_connected : Icons.bluetooth, size: 18),
              label: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 110),
                child: Text(app.printer.connectedName ?? 'Printer', overflow: TextOverflow.ellipsis),
              ),
              onPressed: _pickPrinter,
            ),
          ],
          body: ContentPage(
            maxWidth: 640,
            child: ListView(
              children: [
                const Text('Tap the customer\'s service to print their number.',
                    style: TextStyle(color: AppColors.slate500)),
                const SizedBox(height: 12),
                for (final q in QueueType.values) ...[
                  _QueueButton(
                    queue: q,
                    prefix: snap.prefix(q),
                    waiting: snap.waitingCounts[q] ?? 0,
                    enabled: !_issuing,
                    onTap: () => _issue(q),
                  ),
                  const SizedBox(height: 10),
                ],
                const SizedBox(height: 6),
                SectionCard(
                  title: 'Customers in line',
                  subtitle: '${snap.totalWaiting} waiting across all counters',
                  trailing: IconButton(
                    icon: Icon(_showLine ? Icons.expand_less : Icons.expand_more),
                    onPressed: () => setState(() => _showLine = !_showLine),
                  ),
                  child: _showLine
                      ? (snap.waitingTickets.isEmpty
                          ? const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No customers waiting.')))
                          : Column(children: [
                              for (final t in snap.waitingTickets)
                                ListTile(
                                  dense: true,
                                  title: Row(children: [
                                    SizedBox(width: 72, child: Text(t.queueNumber, style: ticketNumberStyle.copyWith(fontSize: 16))),
                                    QueueChip(t.queueType),
                                  ]),
                                  trailing: Text(formatTime(t.createdAt), style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                                ),
                            ]))
                      : const SizedBox.shrink(),
                ),
                if (_issued.isNotEmpty || _voidNotice != null) ...[
                  const SizedBox(height: 12),
                  SectionCard(
                    title: 'Issued from this device',
                    subtitle: 'Void a ticket printed by mistake.',
                    child: Column(children: [
                      if (_voidNotice != null)
                        Container(
                          margin: const EdgeInsets.all(12),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: AppColors.amberSoft, borderRadius: BorderRadius.circular(8)),
                          child: Row(children: [
                            const Icon(Icons.info_outline, size: 18, color: AppColors.amberDark),
                            const SizedBox(width: 8),
                            Expanded(child: Text(_voidNotice!, style: const TextStyle(color: AppColors.amberDark))),
                          ]),
                        ),
                      for (final t in _issued)
                        ListTile(
                          title: Row(children: [
                            Text(t.queueNumber, style: ticketNumberStyle.copyWith(fontSize: 16)),
                            const SizedBox(width: 10),
                            Text(t.timeFormatted, style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                          ]),
                          trailing: waitingIds.contains(t.id)
                              ? OutlinedButton(
                                  style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), foregroundColor: AppColors.red),
                                  onPressed: () => _void(t),
                                  child: const Text('Void'),
                                )
                              : const Text('Already called', style: TextStyle(color: AppColors.slate500, fontSize: 12)),
                        ),
                    ]),
                  ),
                ],
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  icon: const Icon(Icons.restart_alt),
                  label: const Text('Start new day (reset numbers to 001)'),
                  onPressed: _reset,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _QueueButton extends StatelessWidget {
  const _QueueButton({
    required this.queue,
    required this.prefix,
    required this.waiting,
    required this.enabled,
    required this.onTap,
  });

  final QueueType queue;
  final String prefix;
  final int waiting;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final meta = QueueMeta.of(queue);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 64,
                height: 64,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: meta.color, borderRadius: BorderRadius.circular(14)),
                child: Text(prefix, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: meta.onColor)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(meta.label, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
                    Text('${meta.counter} · ${meta.description}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.slate500, fontSize: 13)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('$waiting', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  const Text('waiting', style: TextStyle(fontSize: 12, color: AppColors.slate500)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
