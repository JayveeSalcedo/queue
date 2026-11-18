import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../app_scope.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Waiting-room TV. Open to everyone: no sign-in. Flashes the counter being
/// called and plays a chime + voice announcement.
class DisplayPage extends StatefulWidget {
  const DisplayPage({super.key});

  @override
  State<DisplayPage> createState() => _DisplayPageState();
}

class _DisplayPageState extends State<DisplayPage> {
  StreamSubscription<CallAnnouncement>? _sub;
  Timer? _clock;
  Timer? _flashTimer;
  DateTime _now = DateTime.now();
  int? _flashingCounter;
  bool _muted = false;

  // Browsers only allow sound after the first tap on the page
  late bool _needsUnlock = kIsWeb;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable(); // keep the TV from sleeping
    _clock = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _now = DateTime.now()));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sub ??= AppScope.of(context).queue.announcements.listen(_onCall);
  }

  void _onCall(CallAnnouncement call) {
    final app = AppScope.of(context);
    setState(() => _flashingCounter = call.counterId);
    _flashTimer?.cancel();
    _flashTimer = Timer(const Duration(seconds: 8), () {
      if (mounted) setState(() => _flashingCounter = null);
    });

    final settings = app.queue.snapshot.settings;
    final soundOn = (settings['sound_enabled'] ?? 'true') != 'false';
    if (_muted || !soundOn) return;
    app.announcer.announce(
      call,
      rate: double.tryParse(settings['tts_voice_rate'] ?? '') ?? 0.9,
      pitch: double.tryParse(settings['tts_voice_pitch'] ?? '') ?? 1.0,
    );
  }

  Future<void> _unlock() async {
    if (!_needsUnlock) return;
    await AppScope.of(context).announcer.unlock();
    if (mounted) setState(() => _needsUnlock = false);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _clock?.cancel();
    _flashTimer?.cancel();
    WakelockPlus.disable();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return ListenableBuilder(
      listenable: app.queue,
      builder: (context, _) {
        final snap = app.queue.snapshot;
        final wide = MediaQuery.sizeOf(context).width >= 800;

        Counter? partnerFor(Counter paused) => snap.counters
            .where((c) => c.id != paused.id && c.isActive && c.inCoverGroup)
            .firstOrNull;

        final panels = [
          for (final q in QueueType.values)
            _Panel(
              queue: q,
              counter: snap.counters.where((c) => c.queueType == q).firstOrNull,
              waiting: snap.waitingCounts[q] ?? 0,
              flashing: _flashingCounter != null &&
                  snap.counters.where((c) => c.queueType == q).any((c) => c.id == _flashingCounter),
              partnerFor: partnerFor,
            ),
        ];

        return Scaffold(
          backgroundColor: AppColors.slate50,
          body: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _unlock,
            onLongPress: () => context.go('/'), // staff exit: press and hold
            child: SafeArea(
              child: Column(
                children: [
                  Container(
                    height: 6,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(colors: [AppColors.forest, AppColors.emerald, Color(0xFFFBBF24)]),
                    ),
                  ),
                  if (_needsUnlock)
                    Container(
                      width: double.infinity,
                      color: AppColors.amberSoft,
                      padding: const EdgeInsets.all(10),
                      child: const Text(
                        'Tap anywhere on this screen to enable chime and voice announcements',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.amberDark),
                      ),
                    ),
                  if (!app.queue.live || app.queue.lastError != null)
                    ConnectionBanner(error: app.queue.lastError, onRetry: app.queue.refresh),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
                    child: Row(
                      children: [
                        Image.asset('assets/images/logo.png', height: wide ? 72 : 48),
                        const SizedBox(width: 18),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(snap.officeName,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: wide ? 34 : 20, fontWeight: FontWeight.w700)),
                              Text(snap.tagline, style: TextStyle(fontSize: wide ? 18 : 13, color: AppColors.slate500)),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(DateFormat('h:mm a').format(_now),
                                style: TextStyle(fontSize: wide ? 34 : 22, fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()])),
                            if (wide)
                              Text(DateFormat('EEEE, MMMM d, y').format(_now), style: const TextStyle(color: AppColors.slate500, fontSize: 16)),
                          ],
                        ),
                        IconButton(
                          tooltip: _muted ? 'Sound off' : 'Sound on',
                          icon: Icon(_muted ? Icons.volume_off : Icons.volume_up),
                          color: _muted ? AppColors.red : AppColors.slate700,
                          onPressed: () => setState(() => _muted = !_muted),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: wide
                          ? Row(children: [
                              for (final (i, p) in panels.indexed) ...[
                                if (i > 0) const SizedBox(width: 16),
                                Expanded(child: p),
                              ],
                            ])
                          : Column(children: [
                              for (final (i, p) in panels.indexed) ...[
                                if (i > 0) const SizedBox(height: 12),
                                Expanded(child: p),
                              ],
                            ]),
                    ),
                  ),
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.slate200),
                    ),
                    child: Row(
                      children: [
                        const Text('RECENTLY SERVED',
                            style: TextStyle(letterSpacing: 1.5, fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate500)),
                        const SizedBox(width: 16),
                        Expanded(
                          child: snap.recentlyServed.isEmpty
                              ? const Text('None yet', style: TextStyle(color: AppColors.slate500))
                              : SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(children: [
                                    for (final t in snap.recentlyServed)
                                      Container(
                                        margin: const EdgeInsets.only(right: 8),
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                        decoration: BoxDecoration(color: AppColors.slate100, borderRadius: BorderRadius.circular(6)),
                                        child: Text(t.queueNumber, style: ticketNumberStyle.copyWith(fontSize: 16, color: AppColors.slate700)),
                                      ),
                                  ]),
                                ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.queue,
    required this.counter,
    required this.waiting,
    required this.flashing,
    required this.partnerFor,
  });

  final QueueType queue;
  final Counter? counter;
  final int waiting;
  final bool flashing;
  final Counter? Function(Counter) partnerFor;

  @override
  Widget build(BuildContext context) {
    final meta = QueueMeta.of(queue);
    final c = counter;
    final paused = c?.isPaused ?? false;
    final partner = paused ? partnerFor(c!) : null;
    final ticket = c?.currentTicket;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 400),
      decoration: BoxDecoration(
        color: flashing ? AppColors.amberSoft : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: flashing ? AppColors.amber : AppColors.slate200, width: flashing ? 4 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Container(height: 6, color: meta.color),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 18, 24, 14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text((c?.name ?? meta.counter).toUpperCase(),
                          style: const TextStyle(letterSpacing: 2, fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.slate500)),
                      Text(meta.label, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: paused
                    ? Column(mainAxisSize: MainAxisSize.min, children: [
                        const Text('COUNTER CLOSED', style: TextStyle(letterSpacing: 2, fontWeight: FontWeight.w600, color: AppColors.amber)),
                        const SizedBox(height: 8),
                        const Text('Paused', style: TextStyle(fontSize: 48, fontWeight: FontWeight.w700, color: AppColors.slate300)),
                        if (partner != null) ...[
                          const SizedBox(height: 12),
                          Text('Please proceed to ${partner.name}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 22)),
                        ],
                      ])
                    : Column(mainAxisSize: MainAxisSize.min, children: [
                        const Text('NOW SERVING', style: TextStyle(letterSpacing: 2, fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.slate500)),
                        const SizedBox(height: 4),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            ticket?.queueNumber ?? '—',
                            style: ticketNumberStyle.copyWith(
                              fontSize: 120,
                              color: ticket == null ? AppColors.slate300 : meta.text,
                            ),
                          ),
                        ),
                      ]),
              ),
            ),
          ),
          Container(
            color: AppColors.slate50,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            child: Row(
              children: [
                const Text('Waiting', style: TextStyle(fontSize: 18, color: AppColors.slate500)),
                const Spacer(),
                Text('$waiting', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
