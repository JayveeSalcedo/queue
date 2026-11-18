import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../models.dart';
import '../theme.dart';

void showMessage(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? AppColors.red : AppColors.slate900,
      behavior: SnackBarBehavior.floating,
    ));
}

Future<bool> confirm(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  bool danger = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: AppColors.red) : null,
          onPressed: () => Navigator.pop(context, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Small coloured label for a queue type.
class QueueChip extends StatelessWidget {
  const QueueChip(this.queue, {super.key});
  final QueueType queue;

  @override
  Widget build(BuildContext context) {
    final meta = QueueMeta.of(queue);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: meta.soft,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: meta.color.withValues(alpha: 0.35)),
      ),
      child: Text(meta.label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: meta.text)),
    );
  }
}

/// Shown on every staff screen: office name, connection state, sign out.
class StationScaffold extends StatelessWidget {
  const StationScaffold({super.key, required this.title, required this.body, this.actions = const []});

  final String title;
  final Widget body;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([app.queue, app.auth]),
      builder: (context, _) {
        final me = app.auth.profile;
        return Scaffold(
          appBar: AppBar(
            title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            actions: [
              ...actions,
              if (me != null)
                PopupMenuButton<String>(
                  tooltip: 'Account',
                  icon: const Icon(Icons.account_circle_outlined),
                  onSelected: (v) async {
                    if (v == 'home') context.go('/');
                    if (v == 'out') {
                      await app.auth.signOut();
                      if (context.mounted) context.go('/');
                    }
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(enabled: false, child: Text('${me.fullName}\n@${me.username}')),
                    const PopupMenuItem(value: 'home', child: Text('All stations')),
                    const PopupMenuItem(value: 'out', child: Text('Sign out')),
                  ],
                ),
            ],
          ),
          body: Column(
            children: [
              if (!app.queue.live || app.queue.lastError != null)
                ConnectionBanner(error: app.queue.lastError, onRetry: app.queue.refresh),
              Expanded(child: body),
            ],
          ),
        );
      },
    );
  }
}

class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({super.key, this.error, required this.onRetry});
  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.amberSoft,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              const Icon(Icons.wifi_off, size: 18, color: AppColors.amberDark),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  error ?? 'Reconnecting… numbers may be out of date.',
                  style: const TextStyle(color: AppColors.amberDark, fontSize: 13),
                ),
              ),
              TextButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
}

/// Centres content and caps its width so phones, tablets and desktop all look right.
class ContentPage extends StatelessWidget {
  const ContentPage({super.key, required this.child, this.maxWidth = 1100});
  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Padding(padding: const EdgeInsets.all(16), child: child),
        ),
      );
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, this.title, this.subtitle, this.trailing, required this.child});
  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          if (subtitle != null)
                            Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.slate500)),
                        ],
                      ),
                    ),
                    ?trailing,
                  ],
                ),
              ),
            if (title != null) const Divider(height: 1),
            child,
          ],
        ),
      );
}
