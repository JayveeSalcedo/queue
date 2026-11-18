import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';
import 'pages/admin_page.dart';
import 'pages/counter_page.dart';
import 'pages/display_page.dart';
import 'pages/guard_page.dart';
import 'pages/home_page.dart';
import 'pages/login_page.dart';
import 'services/auth_service.dart';

const lastStationKey = 'last_station';

/// Where each role starts after signing in.
String homeFor(StaffProfile p) => switch (p.role) {
      StaffRole.admin => '/admin',
      StaffRole.guard => '/guard',
      StaffRole.counter => '/counter/${p.counterId ?? 1}',
    };

GoRouter buildRouter(AuthService auth, String? initialLocation) {
  return GoRouter(
    initialLocation: initialLocation ?? '/',
    refreshListenable: auth,
    redirect: (context, state) {
      final path = state.uri.path;
      final me = auth.profile;
      final needsLogin = path == '/guard' || path == '/admin' || path.startsWith('/counter/');

      if (needsLogin && me == null) {
        return '/login?from=${Uri.encodeComponent(state.uri.toString())}';
      }
      if (me != null) {
        // Keep each role on the screens it may use
        if (path == '/admin' && !me.isAdmin) return homeFor(me);
        if (path == '/guard' && !me.canIssueTickets) return homeFor(me);
        if (path.startsWith('/counter/')) {
          final id = int.tryParse(path.split('/').last) ?? 1;
          if (!me.canOperateCounter(id)) return homeFor(me);
        }
      }
      return null;
    },
    onException: (context, state, router) => router.go('/'),
    routes: [
      GoRoute(path: '/', builder: (_, _) => const HomePage()),
      GoRoute(
        path: '/login',
        builder: (_, state) => LoginPage(from: state.uri.queryParameters['from']),
      ),
      GoRoute(path: '/guard', builder: (_, _) => const _Station('/guard', GuardPage())),
      GoRoute(
        path: '/counter/:id',
        builder: (_, state) {
          final id = int.tryParse(state.pathParameters['id'] ?? '') ?? 1;
          return _Station('/counter/$id', CounterPage(counterId: id), key: ValueKey('counter-$id'));
        },
      ),
      GoRoute(path: '/display', builder: (_, _) => const _Station('/display', DisplayPage())),
      GoRoute(path: '/admin', builder: (_, _) => const _Station('/admin', AdminPage())),
    ],
  );
}

/// Remembers the station so the device reopens on it after a restart.
class _Station extends StatefulWidget {
  const _Station(this.location, this.child, {super.key});

  final String location;
  final Widget child;

  @override
  State<_Station> createState() => _StationState();
}

class _StationState extends State<_Station> {
  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) => p.setString(lastStationKey, widget.location)).catchError((_) => false);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
