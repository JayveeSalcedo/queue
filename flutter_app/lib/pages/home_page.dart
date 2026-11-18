import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Directory of stations. Nothing to type or configure: pick what this
/// device is, sign in if needed, and it reopens there next time.
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([app.queue, app.auth]),
      builder: (context, _) {
        final snap = app.queue.snapshot;
        final me = app.auth.profile;
        final width = MediaQuery.sizeOf(context).width;
        final columns = width > 900 ? 3 : (width > 560 ? 2 : 1);

        final stations = <_Station>[
          _Station(Icons.confirmation_number_outlined, 'Guard station', 'Issue and print queue tickets', '/guard'),
          for (final c in snap.counters.isEmpty ? _fallbackCounters : snap.counters)
            _Station(
              Icons.support_agent_outlined,
              c.name,
              QueueMeta.of(c.queueType).label,
              '/counter/${c.id}',
              color: QueueMeta.of(c.queueType).color,
            ),
          _Station(Icons.tv_outlined, 'Public display', 'Waiting-room TV. No sign-in needed', '/display'),
          _Station(Icons.insights_outlined, 'Admin', 'Reports, settings and staff accounts', '/admin'),
        ];

        return Scaffold(
          appBar: AppBar(
            title: Row(children: [
              Image.asset('assets/images/logo.png', height: 32),
              const SizedBox(width: 12),
              Flexible(child: Text(snap.officeName, overflow: TextOverflow.ellipsis)),
            ]),
            actions: [
              if (me != null)
                TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  icon: const Icon(Icons.logout, size: 18),
                  label: Text(me.username),
                  onPressed: () => app.auth.signOut(),
                ),
            ],
          ),
          body: Column(
            children: [
              if (!app.queue.live || app.queue.lastError != null)
                ConnectionBanner(error: app.queue.lastError, onRetry: app.queue.refresh),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 1000),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                for (final q in QueueType.values) ...[
                                  Expanded(child: _CountTile(q, snap.waitingCounts[q] ?? 0)),
                                  if (q != QueueType.complaint) const SizedBox(width: 10),
                                ],
                              ],
                            ),
                            const SizedBox(height: 20),
                            const Text('What is this device?',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                            const Text('Pick a station. This device will reopen there next time.',
                                style: TextStyle(color: AppColors.slate500)),
                            const SizedBox(height: 12),
                            GridView.count(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              crossAxisCount: columns,
                              mainAxisSpacing: 12,
                              crossAxisSpacing: 12,
                              childAspectRatio: columns == 1 ? 4.2 : 3.2,
                              children: [
                                for (final s in stations)
                                  _StationTile(station: s, onTap: () => _open(context, s, me)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _open(BuildContext context, _Station s, StaffProfile? me) {
    // Staff stations: go through sign-in when needed, but not if the account
    // belongs elsewhere (a counter account tapping Admin lands on its own counter)
    if (s.path == '/display') return context.go(s.path);
    if (me == null) return context.go('/login?from=${Uri.encodeComponent(s.path)}');
    context.go(s.path);
    // The router sends them home if their role may not use it
    if (me.role == StaffRole.counter && s.path != '/counter/${me.counterId}') {
      showMessage(context, 'This account can only use ${me.counterId == null ? 'a counter' : 'Counter ${me.counterId}'}.');
    }
  }

  static final _fallbackCounters = [
    for (final (i, q) in QueueType.values.indexed)
      Counter(id: i + 1, name: 'Counter ${i + 1}', queueType: q, status: 'ACTIVE'),
  ];
}

class _Station {
  _Station(this.icon, this.title, this.subtitle, this.path, {this.color = AppColors.emerald});
  final IconData icon;
  final String title;
  final String subtitle;
  final String path;
  final Color color;
}

class _StationTile extends StatelessWidget {
  const _StationTile({required this.station, required this.onTap});
  final _Station station;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: station.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(station.icon, color: station.color),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(station.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      Text(station.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, color: AppColors.slate500)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.slate300),
              ],
            ),
          ),
        ),
      );
}

class _CountTile extends StatelessWidget {
  const _CountTile(this.queue, this.count);
  final QueueType queue;
  final int count;

  @override
  Widget build(BuildContext context) {
    final meta = QueueMeta.of(queue);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(meta.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: meta.text)),
            const SizedBox(height: 4),
            Text('$count', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
            const Text('waiting', style: TextStyle(fontSize: 12, color: AppColors.slate500)),
          ],
        ),
      ),
    );
  }
}
