import 'dart:convert';
import 'dart:typed_data';

import 'package:file_saver/file_saver.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../app_scope.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/common.dart';

class AdminPage extends StatelessWidget {
  const AdminPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: StationScaffold(
        title: 'Admin',
        body: const Column(
          children: [
            Material(
              color: Colors.white,
              child: TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                tabs: [
                  Tab(icon: Icon(Icons.bar_chart), text: 'Metrics'),
                  Tab(icon: Icon(Icons.list_alt), text: 'History'),
                  Tab(icon: Icon(Icons.settings_outlined), text: 'Settings'),
                  Tab(icon: Icon(Icons.group_outlined), text: 'Staff'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(children: [_MetricsTab(), _HistoryTab(), _SettingsTab(), _StaffTab()]),
            ),
          ],
        ),
      ),
    );
  }
}

String _day(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

class _DateBar extends StatelessWidget {
  const _DateBar({required this.date, required this.onChanged, this.trailing});
  final DateTime date;
  final ValueChanged<DateTime> onChanged;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          OutlinedButton.icon(
            icon: const Icon(Icons.calendar_today, size: 18),
            label: Text(DateFormat('EEE, MMM d, y').format(date)),
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime(2024),
                lastDate: DateTime.now(),
              );
              if (picked != null) onChanged(picked);
            },
          ),
          const Spacer(),
          ?trailing,
        ],
      );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

class _MetricsTab extends StatefulWidget {
  const _MetricsTab();

  @override
  State<_MetricsTab> createState() => _MetricsTabState();
}

class _MetricsTabState extends State<_MetricsTab> with AutomaticKeepAliveClientMixin {
  DateTime _date = DateTime.now();
  AdminMetrics? _metrics;
  String? _error;
  bool _loading = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_metrics == null && _loading && _error == null) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final m = await AppScope.of(context).queue.metrics(_date);
      if (mounted) setState(() => _metrics = m);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final m = _metrics;
    return ContentPage(
      child: ListView(
        children: [
          _DateBar(
            date: _date,
            onChanged: (d) {
              setState(() => _date = d);
              _load();
            },
            trailing: IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          ),
          const SizedBox(height: 16),
          if (_loading && m == null) const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator())),
          if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.red)),
          if (m != null) ...[
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _Stat('Total tickets', '${m.statusCounts['TOTAL'] ?? 0}', Icons.confirmation_number_outlined),
                _Stat('Completed', '${m.statusCounts['COMPLETED'] ?? 0}', Icons.check_circle_outline),
                _Stat('Waiting now', '${m.statusCounts['WAITING'] ?? 0}', Icons.hourglass_empty),
                _Stat('Cancelled', '${m.statusCounts['CANCELLED'] ?? 0}', Icons.cancel_outlined),
                _Stat('Avg. wait', '${m.avgWaitMinutes} min', Icons.timer_outlined),
                _Stat('Avg. service', '${m.avgServiceMinutes} min', Icons.support_agent_outlined),
              ],
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'By queue',
              child: Column(children: [
                for (final q in QueueType.values)
                  ListTile(
                    title: Text(QueueMeta.of(q).label),
                    leading: CircleAvatar(radius: 6, backgroundColor: QueueMeta.of(q).color),
                    trailing: Text('${m.queueCounts[q] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                  ),
              ]),
            ),
            const SizedBox(height: 16),
            SectionCard(
              title: 'Served per counter',
              child: Column(children: [
                for (final c in m.counterPerformance)
                  ListTile(
                    title: Text(c.counterName),
                    trailing: Text('${c.served}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                  ),
              ]),
            ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.icon);
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 170,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 20, color: AppColors.emerald),
                const SizedBox(height: 8),
                Text(value, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                Text(label, style: const TextStyle(color: AppColors.slate500, fontSize: 13)),
              ],
            ),
          ),
        ),
      );
}

// ---------------------------------------------------------------------------
// History + CSV export
// ---------------------------------------------------------------------------

class _HistoryTab extends StatefulWidget {
  const _HistoryTab();

  @override
  State<_HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<_HistoryTab> with AutomaticKeepAliveClientMixin {
  DateTime _date = DateTime.now();
  List<Ticket>? _tickets;
  String? _error;
  bool _loading = false;
  bool _started = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final t = await AppScope.of(context).queue.history(_date);
      if (mounted) setState(() => _tickets = t);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _csvCell(Object? v) {
    final s = v == null ? '' : '$v';
    // Quote cells with separators / quotes, and neutralise spreadsheet formulas
    final safe = RegExp(r'^[=+\-@]').hasMatch(s) ? "'$s" : s;
    return safe.contains(RegExp(r'[",\n]')) ? '"${safe.replaceAll('"', '""')}"' : safe;
  }

  Future<void> _export() async {
    final tickets = _tickets;
    if (tickets == null || tickets.isEmpty) {
      showMessage(context, 'No tickets on this date to export.');
      return;
    }
    String ts(DateTime? d) => d == null ? '' : DateFormat('yyyy-MM-dd HH:mm:ss').format(d);
    final rows = <List<Object?>>[
      ['Queue Number', 'Queue Type', 'Date', 'Status', 'Created At', 'Called At', 'Completed At', 'Counter', 'Served By', 'Notes'],
      for (final t in tickets.reversed)
        [t.queueNumber, t.queueType.code, _day(_date), t.status, ts(t.createdAt), ts(t.calledAt), ts(t.completedAt), t.counterName, t.calledByUser, t.notes],
    ];
    final csv = rows.map((r) => r.map(_csvCell).join(',')).join('\r\n');
    try {
      await FileSaver.instance.saveFile(
        name: 'queue-records-${_day(_date)}',
        bytes: Uint8List.fromList(utf8.encode('﻿$csv')), // BOM so Excel reads UTF-8
        fileExtension: 'csv',
        mimeType: MimeType.csv,
      );
      if (mounted) showMessage(context, 'Exported ${tickets.length} tickets.');
    } catch (e) {
      if (mounted) showMessage(context, 'Export failed: $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final tickets = _tickets;
    return ContentPage(
      child: Column(
        children: [
          _DateBar(
            date: _date,
            onChanged: (d) {
              setState(() => _date = d);
              _load();
            },
            trailing: Row(children: [
              IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              FilledButton.icon(icon: const Icon(Icons.download), label: const Text('Export CSV'), onPressed: _export),
            ]),
          ),
          const SizedBox(height: 12),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.red)),
          Expanded(
            child: tickets == null
                ? const SizedBox.shrink()
                : tickets.isEmpty
                    ? const Center(child: Text('No tickets on this date.', style: TextStyle(color: AppColors.slate500)))
                    : Card(
                        child: ListView.separated(
                          itemCount: tickets.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final t = tickets[i];
                            return ListTile(
                              dense: true,
                              leading: SizedBox(width: 64, child: Text(t.queueNumber, style: ticketNumberStyle.copyWith(fontSize: 16))),
                              title: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                                QueueChip(t.queueType),
                                Text(t.status ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                                if (t.counterName != null) Text(t.counterName!, style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                              ]),
                              subtitle: t.notes == null ? null : Text(t.notes!, maxLines: 1, overflow: TextOverflow.ellipsis),
                              trailing: Text(formatTime(t.createdAt), style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

class _SettingsTab extends StatefulWidget {
  const _SettingsTab();

  @override
  State<_SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<_SettingsTab> with AutomaticKeepAliveClientMixin {
  static const _fields = <(String key, String label, String help)>[
    ('office_name', 'Office name', 'Shown on the TV and printed on every ticket'),
    ('office_tagline', 'Tagline', 'Shown under the office name on the TV'),
    ('regular_prefix', 'Regular prefix', 'Letter(s) before the number, e.g. R-001'),
    ('priority_prefix', 'Priority prefix', 'e.g. P-001'),
    ('complaint_prefix', 'Request / Complaint prefix', 'e.g. C-001'),
    ('tts_voice_rate', 'Voice speed', '0.5 slow – 1.5 fast (0.9 is a good default)'),
    ('tts_voice_pitch', 'Voice pitch', '0.5 low – 2.0 high'),
    ('timezone', 'Time zone', 'Decides when "today" starts, e.g. Asia/Manila'),
  ];

  final _controllers = <String, TextEditingController>{for (final f in _fields) f.$1: TextEditingController()};
  bool _sound = true;
  bool _saving = false;
  bool _filled = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_filled) {
      final settings = AppScope.of(context).queue.snapshot.settings;
      if (settings.isNotEmpty) {
        _filled = true;
        for (final f in _fields) {
          _controllers[f.$1]!.text = settings[f.$1] ?? '';
        }
        _sound = (settings['sound_enabled'] ?? 'true') != 'false';
      }
    }
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final rate = double.tryParse(_controllers['tts_voice_rate']!.text);
    final pitch = double.tryParse(_controllers['tts_voice_pitch']!.text);
    if (rate == null || rate < 0.3 || rate > 2 || pitch == null || pitch < 0.3 || pitch > 2) {
      showMessage(context, 'Voice speed and pitch must be numbers between 0.3 and 2.', error: true);
      return;
    }
    if (_controllers['regular_prefix']!.text.trim().isEmpty ||
        _controllers['priority_prefix']!.text.trim().isEmpty ||
        _controllers['complaint_prefix']!.text.trim().isEmpty) {
      showMessage(context, 'Each queue needs a prefix.', error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      await AppScope.of(context).queue.updateSettings({
        for (final f in _fields) f.$1: _controllers[f.$1]!.text.trim(),
        'sound_enabled': '$_sound',
      });
      if (mounted) showMessage(context, 'Settings saved.');
    } catch (e) {
      if (mounted) showMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return ContentPage(
      maxWidth: 640,
      child: ListView(
        children: [
          SectionCard(
            title: 'Office settings',
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  for (final f in _fields) ...[
                    TextField(controller: _controllers[f.$1], decoration: InputDecoration(labelText: f.$2, helperText: f.$3)),
                    const SizedBox(height: 14),
                  ],
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Announce calls on the TV'),
                    subtitle: const Text('Chime and spoken announcement'),
                    value: _sound,
                    onChanged: (v) => setState(() => _sound = v),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    icon: const Icon(Icons.save_outlined),
                    label: Text(_saving ? 'Saving…' : 'Save settings'),
                    onPressed: _saving ? null : _save,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Staff accounts
// ---------------------------------------------------------------------------

class _StaffTab extends StatefulWidget {
  const _StaffTab();

  @override
  State<_StaffTab> createState() => _StaffTabState();
}

class _StaffTabState extends State<_StaffTab> with AutomaticKeepAliveClientMixin {
  List<StaffProfile>? _staff;
  String? _error;
  bool _started = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load();
    }
  }

  Future<void> _load() async {
    try {
      final s = await AppScope.of(context).queue.listStaff();
      if (!mounted) return;
      setState(() {
        _staff = s;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<String?> _askPassword(String title) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          obscureText: true,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'New password (8+ characters)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text), child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> _resetPassword(StaffProfile p) async {
    final password = await _askPassword('New password for ${p.username}');
    if (password == null || !mounted) return;
    try {
      await AppScope.of(context).queue.manageStaff({'action': 'set_password', 'user_id': p.id, 'password': password});
      if (mounted) showMessage(context, 'Password updated for ${p.username}.');
    } catch (e) {
      if (mounted) showMessage(context, '$e', error: true);
    }
  }

  Future<void> _delete(StaffProfile p) async {
    final ok = await confirm(context,
        title: 'Delete ${p.username}?', message: 'This account will no longer be able to sign in.', confirmLabel: 'Delete', danger: true);
    if (!ok || !mounted) return;
    try {
      await AppScope.of(context).queue.manageStaff({'action': 'delete', 'user_id': p.id});
      await _load();
    } catch (e) {
      if (mounted) showMessage(context, '$e', error: true);
    }
  }

  Future<void> _add() async {
    final username = TextEditingController();
    final fullName = TextEditingController();
    final password = TextEditingController();
    var role = StaffRole.counter;
    var counterId = 1;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Add staff account'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: username, autocorrect: false, decoration: const InputDecoration(labelText: 'Username')),
                const SizedBox(height: 10),
                TextField(controller: fullName, decoration: const InputDecoration(labelText: 'Full name')),
                const SizedBox(height: 10),
                TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password (8+ characters)')),
                const SizedBox(height: 10),
                DropdownButtonFormField<StaffRole>(
                  initialValue: role,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: [for (final r in StaffRole.values) DropdownMenuItem(value: r, child: Text(r.code))],
                  onChanged: (v) => setLocal(() => role = v ?? role),
                ),
                if (role == StaffRole.counter) ...[
                  const SizedBox(height: 10),
                  DropdownButtonFormField<int>(
                    initialValue: counterId,
                    decoration: const InputDecoration(labelText: 'Operates counter'),
                    items: [for (final i in [1, 2, 3]) DropdownMenuItem(value: i, child: Text('Counter $i'))],
                    onChanged: (v) => setLocal(() => counterId = v ?? counterId),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Create')),
          ],
        ),
      ),
    );
    final body = {
      'action': 'create',
      'username': username.text,
      'full_name': fullName.text,
      'password': password.text,
      'role': role.code,
      'counter_id': role == StaffRole.counter ? counterId : null,
    };
    username.dispose();
    fullName.dispose();
    password.dispose();
    if (ok != true || !mounted) return;
    try {
      await AppScope.of(context).queue.manageStaff(body);
      await _load();
      if (mounted) showMessage(context, 'Account created.');
    } catch (e) {
      if (mounted) showMessage(context, '$e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final me = AppScope.of(context).auth.profile;
    final staff = _staff;
    return ContentPage(
      maxWidth: 720,
      child: ListView(
        children: [
          Row(children: [
            const Expanded(child: Text('Staff accounts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
            FilledButton.icon(icon: const Icon(Icons.person_add_alt), label: const Text('Add'), onPressed: _add),
          ]),
          const SizedBox(height: 12),
          if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.red)),
          if (staff == null && _error == null) const Center(child: CircularProgressIndicator()),
          if (staff != null)
            Card(
              child: Column(children: [
                for (final p in staff)
                  ListTile(
                    leading: const Icon(Icons.badge_outlined),
                    title: Text('${p.fullName}  ·  @${p.username}'),
                    subtitle: Text(p.role == StaffRole.counter && p.counterId != null ? 'COUNTER · Counter ${p.counterId}' : p.role.code),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      IconButton(tooltip: 'Reset password', icon: const Icon(Icons.key_outlined), onPressed: () => _resetPassword(p)),
                      if (p.id != me?.id)
                        IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline, color: AppColors.red), onPressed: () => _delete(p)),
                    ]),
                  ),
              ]),
            ),
          const SizedBox(height: 12),
          const Text(
            'Staff accounts need the manage-staff function deployed in Supabase (see the setup guide).',
            style: TextStyle(color: AppColors.slate500, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
