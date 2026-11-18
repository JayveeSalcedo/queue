import 'package:flutter/material.dart';

import '../app_scope.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/common.dart';

class CounterPage extends StatefulWidget {
  const CounterPage({super.key, required this.counterId});
  final int counterId;

  @override
  State<CounterPage> createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  bool _busy = false;

  /// Runs one action at a time so a double tap can't call two customers.
  Future<void> _run(Future<void> Function() action, {String? successMessage}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted && successMessage != null) showMessage(context, successMessage);
    } catch (e) {
      if (mounted) showMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _callNext() => _run(() async {
        final number = await AppScope.of(context).queue.callNext(widget.counterId);
        if (number == null && mounted) showMessage(context, 'No customers are waiting in this queue.');
      });

  Future<void> _transfer(Ticket ticket) async {
    final queue = AppScope.of(context).queue;
    var target = QueueType.values.firstWhere((q) => q != ticket.queueType);
    final notes = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text('Transfer ${ticket.queueNumber}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Send this customer back to the waiting list of:'),
              const SizedBox(height: 8),
              for (final q in QueueType.values)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(target == q ? Icons.radio_button_checked : Icons.radio_button_off,
                      color: target == q ? QueueMeta.of(q).color : AppColors.slate300),
                  title: Text(QueueMeta.of(q).label),
                  onTap: () => setLocal(() => target = q),
                ),
              TextField(
                controller: notes,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Transfer')),
          ],
        ),
      ),
    );
    final note = notes.text;
    notes.dispose();
    if (ok != true) return;
    await _run(
      () => queue.transfer(widget.counterId, ticket.id, target, note),
      successMessage: '${ticket.queueNumber} moved to ${QueueMeta.of(target).label}.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final queue = app.queue;
    return ListenableBuilder(
      listenable: queue,
      builder: (context, _) {
        final snap = queue.snapshot;
        final counter = snap.counter(widget.counterId);
        if (counter == null) {
          return StationScaffold(
            title: 'Counter ${widget.counterId}',
            body: Center(child: queue.loaded ? const Text('This counter does not exist.') : const CircularProgressIndicator()),
          );
        }

        final meta = QueueMeta.of(counter.queueType);
        final paused = counter.isPaused;
        final current = counter.currentTicket;

        // Queues this counter also covers because the partner counter is paused
        final covering = counter.inCoverGroup && !paused
            ? snap.counters.where((c) => c.id != counter.id && c.isPaused && c.inCoverGroup).toList()
            : <Counter>[];
        final servable = {counter.queueType, ...covering.map((c) => c.queueType)};
        final coveredBy = paused
            ? snap.counters.where((c) => c.id != counter.id && c.isActive && c.inCoverGroup).firstOrNull
            : null;

        // Priority first when covering both, matching the server's call order
        final waiting = snap.waitingTickets.where((t) => servable.contains(t.queueType)).toList()
          ..sort((a, b) {
            if (a.queueType != b.queueType) return a.queueType == QueueType.priority ? -1 : 1;
            return a.numberSeq.compareTo(b.numberSeq);
          });
        final onHold = snap.skippedTickets
            .where((t) => t.counterId == counter.id || t.queueType == counter.queueType)
            .toList();

        final wide = MediaQuery.sizeOf(context).width >= 900;

        final servingCard = _ServingCard(
          counter: counter,
          busy: _busy,
          onNext: _callNext,
          onComplete: () => _run(() => queue.complete(counter.id)),
          onRecall: () => _run(() => queue.recall(counter.id), successMessage: 'Announced again.'),
          onSkip: () => _run(() => queue.skip(counter.id)),
          onTransfer: current == null ? null : () => _transfer(current),
        );

        final banners = <Widget>[
          if (paused)
            _Banner(
              color: AppColors.amberSoft,
              textColor: AppColors.amberDark,
              icon: Icons.pause_circle_outline,
              title: 'This counter is paused',
              message: coveredBy != null
                  ? 'Waiting ${meta.label.toLowerCase()} customers are being called by ${coveredBy.name}.'
                  : 'Waiting customers are held until a counter is available.',
              action: FilledButton.icon(
                icon: const Icon(Icons.play_arrow),
                label: const Text('Resume'),
                onPressed: _busy ? null : () => _run(() => queue.setCounterPaused(counter.id, false)),
              ),
            ),
          if (covering.isNotEmpty)
            _Banner(
              color: AppColors.emeraldSoft,
              textColor: AppColors.forest,
              icon: Icons.support,
              title: 'Covering for ${covering.map((c) => c.name).join(' & ')}',
              message: servable.contains(QueueType.priority) && servable.length > 1
                  ? 'Next customer also calls ${covering.map((c) => QueueMeta.of(c.queueType).label.toLowerCase()).join(' & ')} tickets. Priority customers are called first.'
                  : 'Next customer also calls ${covering.map((c) => QueueMeta.of(c.queueType).label.toLowerCase()).join(' & ')} tickets.',
            ),
        ];

        final waitingCard = SectionCard(
          title: 'Waiting list',
          trailing: _CountBadge(waiting.length),
          child: waiting.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40, horizontal: 16),
                  child: Center(child: Text('No one is waiting.\nNew tickets from the guard appear here.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.slate500))),
                )
              : Column(children: [
                  for (final (i, t) in waiting.indexed)
                    Container(
                      color: i == 0 ? AppColors.emeraldSoft : null,
                      child: ListTile(
                        leading: SizedBox(width: 20, child: Text('${i + 1}', textAlign: TextAlign.right, style: const TextStyle(color: AppColors.slate500, fontSize: 12))),
                        title: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                          Text(t.queueNumber, style: ticketNumberStyle.copyWith(fontSize: 20)),
                          if (i == 0) const _NextBadge(),
                          if (t.queueType != counter.queueType) QueueChip(t.queueType),
                        ]),
                        subtitle: Text('Issued ${formatTime(t.createdAt)}', style: const TextStyle(fontSize: 12)),
                        trailing: OutlinedButton(
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 38)),
                          onPressed: _busy || paused ? null : () => _run(() => queue.callTicket(counter.id, t.id)),
                          child: const Text('Call'),
                        ),
                      ),
                    ),
                ]),
        );

        final holdCard = onHold.isEmpty
            ? null
            : SectionCard(
                title: 'On hold',
                subtitle: 'Skipped customers who may return.',
                trailing: _CountBadge(onHold.length),
                child: Column(children: [
                  for (final t in onHold)
                    ListTile(
                      title: Text(t.queueNumber, style: ticketNumberStyle.copyWith(fontSize: 20)),
                      subtitle: t.calledAt == null ? null : Text('Called ${formatTime(t.calledAt)}', style: const TextStyle(fontSize: 12)),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        FilledButton(
                          style: FilledButton.styleFrom(minimumSize: const Size(0, 38)),
                          onPressed: _busy || paused ? null : () => _run(() => queue.recallSkipped(counter.id, t.id)),
                          child: const Text('Call back'),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 38)),
                          onPressed: _busy
                              ? null
                              : () async {
                                  final ok = await confirm(context,
                                      title: 'Mark ${t.queueNumber} as no show?',
                                      message: 'The ticket will be cancelled.',
                                      confirmLabel: 'No show');
                                  if (ok) await _run(() => queue.markNoShow(counter.id, t.id));
                                },
                          child: const Text('No show'),
                        ),
                      ]),
                    ),
                ]),
              );

        final header = Row(
          children: [
            Expanded(
              child: Wrap(
                spacing: 10,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(counter.name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                  QueueChip(counter.queueType),
                  if (paused) const Chip(label: Text('Paused'), visualDensity: VisualDensity.compact),
                ],
              ),
            ),
            Text('${waiting.length} waiting', style: const TextStyle(fontWeight: FontWeight.w600)),
            if (counter.inCoverGroup && !paused) ...[
              const SizedBox(width: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.pause, size: 18),
                label: const Text('Pause'),
                onPressed: _busy ? null : () => _run(() => queue.setCounterPaused(counter.id, true)),
              ),
            ],
          ],
        );

        return StationScaffold(
          title: counter.name,
          body: ContentPage(
            child: ListView(
              children: [
                header,
                const SizedBox(height: 12),
                for (final b in banners) ...[b, const SizedBox(height: 12)],
                if (wide)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 8,
                        child: Column(children: [servingCard, if (holdCard != null) ...[const SizedBox(height: 16), holdCard]]),
                      ),
                      const SizedBox(width: 16),
                      Expanded(flex: 4, child: waitingCard),
                    ],
                  )
                else ...[
                  servingCard,
                  const SizedBox(height: 16),
                  waitingCard,
                  if (holdCard != null) ...[const SizedBox(height: 16), holdCard],
                ],
                const SizedBox(height: 24),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ServingCard extends StatelessWidget {
  const _ServingCard({
    required this.counter,
    required this.busy,
    required this.onNext,
    required this.onComplete,
    required this.onRecall,
    required this.onSkip,
    required this.onTransfer,
  });

  final Counter counter;
  final bool busy;
  final VoidCallback onNext;
  final VoidCallback onComplete;
  final VoidCallback onRecall;
  final VoidCallback onSkip;
  final VoidCallback? onTransfer;

  @override
  Widget build(BuildContext context) {
    final current = counter.currentTicket;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 16),
            child: Column(
              children: [
                const Text('NOW SERVING', style: TextStyle(letterSpacing: 2, fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.slate500)),
                const SizedBox(height: 8),
                if (current != null) ...[
                  FittedBox(
                    child: Text(current.queueNumber, style: ticketNumberStyle.copyWith(fontSize: 96, color: AppColors.slate900)),
                  ),
                  Text('Called at ${current.calledAt == null ? 'just now' : formatTime(current.calledAt)}',
                      style: const TextStyle(color: AppColors.slate500)),
                ] else ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text('No customer at the counter', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: AppColors.slate300)),
                  ),
                  Text(counter.isPaused ? 'Resume the counter to start calling.' : 'Press Next customer to call the next number.',
                      style: const TextStyle(color: AppColors.slate500)),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(68), textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              onPressed: busy || counter.isPaused ? null : onNext,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(counter.isPaused ? 'Counter paused' : 'Next customer'),
                  if (!counter.isPaused) const Icon(Icons.chevron_right, size: 28),
                ],
              ),
            ),
          ),
          if (current != null)
            Container(
              color: AppColors.slate50,
              padding: const EdgeInsets.all(16),
              child: Wrap(
                spacing: 10,
                runSpacing: 10,
                alignment: WrapAlignment.center,
                children: [
                  _ActionButton(Icons.check_circle_outline, 'Complete', AppColors.emerald, busy ? null : onComplete),
                  _ActionButton(Icons.volume_up_outlined, 'Recall', AppColors.slate500, busy ? null : onRecall),
                  _ActionButton(Icons.skip_next_outlined, 'Skip', AppColors.slate500, busy ? null : onSkip),
                  _ActionButton(Icons.swap_horiz, 'Transfer', AppColors.slate500, busy ? null : onTransfer),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton(this.icon, this.label, this.color, this.onPressed);
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 140,
        child: OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 52), backgroundColor: Colors.white),
          icon: Icon(icon, color: onPressed == null ? null : color),
          label: Text(label),
          onPressed: onPressed,
        ),
      );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.color, required this.textColor, required this.icon, required this.title, required this.message, this.action});
  final Color color;
  final Color textColor;
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12), border: Border.all(color: textColor.withValues(alpha: 0.2))),
        child: Row(
          children: [
            Icon(icon, color: textColor),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: textColor)),
                  Text(message, style: TextStyle(color: textColor, fontSize: 13)),
                ],
              ),
            ),
            if (action != null) ...[const SizedBox(width: 12), action!],
          ],
        ),
      );
}

class _CountBadge extends StatelessWidget {
  const _CountBadge(this.count);
  final int count;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(color: AppColors.slate100, borderRadius: BorderRadius.circular(20)),
        child: Text('$count', style: const TextStyle(fontWeight: FontWeight.w700)),
      );
}

class _NextBadge extends StatelessWidget {
  const _NextBadge();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: AppColors.emerald, borderRadius: BorderRadius.circular(6)),
        child: const Text('Next', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
      );
}
