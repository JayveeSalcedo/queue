import 'package:flutter/widgets.dart';

import 'services/announcer.dart';
import 'services/auth_service.dart';
import 'services/printer_service.dart';
import 'services/queue_service.dart';

/// The app's shared services, available to every screen via [AppScope.of].
class AppScope extends InheritedWidget {
  const AppScope({
    super.key,
    required this.auth,
    required this.queue,
    required this.announcer,
    required this.printer,
    required super.child,
  });

  final AuthService auth;
  final QueueService queue;
  final Announcer announcer;
  final PrinterService printer;

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope missing above this widget');
    return scope!;
  }

  @override
  bool updateShouldNotify(AppScope old) => false;
}
