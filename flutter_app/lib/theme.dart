import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'models.dart';

/// Green & yellow office colorway, same as the web version.
class AppColors {
  static const forest = Color(0xFF065F46); // emerald-800
  static const emerald = Color(0xFF047857); // emerald-700
  static const emeraldSoft = Color(0xFFECFDF5); // emerald-50
  static const amber = Color(0xFFF59E0B); // amber-500
  static const amberSoft = Color(0xFFFFFBEB); // amber-50
  static const amberDark = Color(0xFF92400E); // amber-800
  static const sky = Color(0xFF0369A1); // sky-700
  static const skySoft = Color(0xFFF0F9FF); // sky-50
  static const slate900 = Color(0xFF0F172A);
  static const slate700 = Color(0xFF334155);
  static const slate500 = Color(0xFF64748B);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate50 = Color(0xFFF8FAFC);
  static const red = Color(0xFFB91C1C);
}

/// One colour per queue, used the same way on every screen:
/// Regular = green, Priority = amber, Request / Complaint = blue.
class QueueMeta {
  const QueueMeta({
    required this.label,
    required this.description,
    required this.counter,
    required this.color,
    required this.onColor,
    required this.soft,
    required this.text,
  });

  final String label;
  final String description;
  final String counter;
  final Color color;
  final Color onColor;
  final Color soft;
  final Color text;

  static const _meta = {
    QueueType.regular: QueueMeta(
      label: 'Regular',
      description: 'General inquiries and transactions',
      counter: 'Counter 1',
      color: AppColors.emerald,
      onColor: Colors.white,
      soft: AppColors.emeraldSoft,
      text: AppColors.forest,
    ),
    QueueType.priority: QueueMeta(
      label: 'Priority',
      description: 'Senior citizens, PWD, pregnant women',
      counter: 'Counter 2',
      color: AppColors.amber,
      onColor: Color(0xFF451A03),
      soft: AppColors.amberSoft,
      text: Color(0xFFD97706),
    ),
    QueueType.complaint: QueueMeta(
      label: 'Request / Complaint',
      description: 'Formal requests and complaints',
      counter: 'Counter 3',
      color: AppColors.sky,
      onColor: Colors.white,
      soft: AppColors.skySoft,
      text: Color(0xFF075985),
    ),
  };

  static QueueMeta of(QueueType q) => _meta[q]!;
}

String formatTime(DateTime? value) => value == null ? '' : DateFormat('h:mm a').format(value);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.emerald,
    primary: AppColors.emerald,
    secondary: AppColors.amber,
    surface: Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.slate50,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.forest,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: const CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
        side: BorderSide(color: AppColors.slate200),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.emerald,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.slate700,
        minimumSize: const Size(0, 48),
        side: const BorderSide(color: AppColors.slate300),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(10))),
    ),
  );
}

/// Ticket numbers use tabular figures so they don't jiggle as they change.
const ticketNumberStyle = TextStyle(
  fontWeight: FontWeight.w800,
  letterSpacing: 1,
  fontFeatures: [FontFeature.tabularFigures()],
);
