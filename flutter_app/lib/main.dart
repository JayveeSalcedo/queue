import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_scope.dart';
import 'config.dart';
import 'router.dart';
import 'services/announcer.dart';
import 'services/auth_service.dart';
import 'services/printer_service.dart';
import 'services/queue_service.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (!isConfigured) {
    runApp(MaterialApp(theme: buildTheme(), home: const _MissingConfigScreen()));
    return;
  }

  await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseAnonKey);
  final db = Supabase.instance.client;

  final auth = AuthService(db);
  await auth.init();
  final queue = QueueService(db)..start();
  final printer = PrinterService()..reconnectLast();

  // Reopen the station this device was last used as (guard phone, counter
  // PC, TV...), so after a restart it is ready without any taps.
  final prefs = await SharedPreferences.getInstance();
  final lastStation = prefs.getString(lastStationKey);

  runApp(AppScope(
    auth: auth,
    queue: queue,
    announcer: Announcer(),
    printer: printer,
    child: QueueApp(auth: auth, initialLocation: lastStation),
  ));
}

class QueueApp extends StatefulWidget {
  const QueueApp({super.key, required this.auth, this.initialLocation});

  final AuthService auth;
  final String? initialLocation;

  @override
  State<QueueApp> createState() => _QueueAppState();
}

class _QueueAppState extends State<QueueApp> {
  late final _router = buildRouter(widget.auth, widget.initialLocation);

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'Queue',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        routerConfig: _router,
      );
}

class _MissingConfigScreen extends StatelessWidget {
  const _MissingConfigScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: const Padding(
              padding: EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Supabase is not configured', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  SizedBox(height: 12),
                  Text('Copy env.example.json to env.json, fill in your project URL and anon key, then run:'),
                  SizedBox(height: 12),
                  SelectableText('flutter run --dart-define-from-file=env.json',
                      style: TextStyle(fontFamily: 'monospace')),
                ],
              ),
            ),
          ),
        ),
      );
}
