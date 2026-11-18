import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';
import 'errors.dart';

/// Live queue state shared by every screen.
///
/// Every change made anywhere inserts a row into `queue_events`. This
/// service listens for those over Supabase Realtime and re-reads
/// `queue_snapshot()`, so all phones, counters and the TV stay in sync.
/// Called / recalled tickets are also pushed to [announcements] for the
/// display's chime and voice.
class QueueService extends ChangeNotifier {
  QueueService(this._db);

  final SupabaseClient _db;

  QueueSnapshot snapshot = QueueSnapshot.empty();
  bool loaded = false;

  /// Realtime connection is up. When false, screens show a warning and the
  /// service falls back to polling.
  bool live = false;
  String? lastError;

  final _announcements = StreamController<CallAnnouncement>.broadcast();
  Stream<CallAnnouncement> get announcements => _announcements.stream;

  RealtimeChannel? _channel;
  Timer? _debounce;
  Timer? _poll;
  bool _refreshing = false;
  bool _refreshAgain = false;

  void start() {
    if (_channel != null) return;
    _channel = _db
        .channel('queue-events')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'queue_events',
          callback: _onEvent,
        )
        .subscribe((status, error) {
      final nowLive = status == RealtimeSubscribeStatus.subscribed;
      if (nowLive && !live) refresh(); // catch up on anything missed while offline
      live = nowLive;
      notifyListeners();
    });

    // Safety net: realtime can silently drop on flaky networks
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!live) refresh();
    });
    refresh();
  }

  void _onEvent(PostgresChangePayload change) {
    final action = change.newRecord['action'];
    final payload = change.newRecord['payload'];
    if ((action == 'CALLED' || action == 'RECALLED') && payload is Map) {
      _announcements.add(CallAnnouncement.fromJson(
        Map<String, dynamic>.from(payload),
        isRecall: action == 'RECALLED',
      ));
    }
    // A burst of events (e.g. complete + call) becomes one refresh
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 150), refresh);
  }

  Future<void> refresh() async {
    if (_refreshing) {
      _refreshAgain = true;
      return;
    }
    _refreshing = true;
    try {
      do {
        _refreshAgain = false;
        final result = await _db.rpc('queue_snapshot');
        snapshot = QueueSnapshot.fromJson(Map<String, dynamic>.from(result as Map));
        loaded = true;
        lastError = null;
      } while (_refreshAgain);
    } catch (e) {
      lastError = friendlyError(e);
    } finally {
      _refreshing = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>> _rpc(String fn, [Map<String, dynamic>? params]) async {
    try {
      final result = await _db.rpc(fn, params: params);
      unawaited(refresh());
      return result is Map ? Map<String, dynamic>.from(result) : <String, dynamic>{};
    } catch (e) {
      unawaited(refresh());
      throw AppError(friendlyError(e));
    }
  }

  // --- Guard -------------------------------------------------------------

  Future<IssuedTicket> generateTicket(QueueType q) async =>
      IssuedTicket.fromJson(await _rpc('generate_ticket', {'p_queue_type': q.code}));

  /// Returns true when the number will be issued again to the next customer.
  Future<bool> voidTicket(int ticketId) async =>
      (await _rpc('void_ticket', {'p_ticket_id': ticketId}))['sequence_rolled_back'] == true;

  Future<void> resetDaily() => _rpc('reset_daily');

  // --- Counters ----------------------------------------------------------

  /// Returns the called ticket number, or null when nobody is waiting.
  Future<String?> callNext(int counterId) async {
    final result = await _rpc('call_next', {'p_counter_id': counterId});
    final ticket = result['ticket'];
    return ticket is Map ? '${ticket['queue_number']}' : null;
  }

  Future<void> callTicket(int counterId, int ticketId) =>
      _rpc('call_ticket', {'p_counter_id': counterId, 'p_ticket_id': ticketId});

  Future<void> recall(int counterId) => _rpc('recall_ticket', {'p_counter_id': counterId});

  Future<void> skip(int counterId) => _rpc('skip_ticket', {'p_counter_id': counterId});

  Future<void> complete(int counterId) => _rpc('complete_ticket', {'p_counter_id': counterId});

  Future<void> recallSkipped(int counterId, int ticketId) =>
      _rpc('recall_skipped', {'p_counter_id': counterId, 'p_ticket_id': ticketId});

  Future<void> markNoShow(int counterId, int ticketId) =>
      _rpc('mark_no_show', {'p_counter_id': counterId, 'p_ticket_id': ticketId});

  Future<void> transfer(int counterId, int ticketId, QueueType target, String? notes) => _rpc('transfer_ticket', {
        'p_counter_id': counterId,
        'p_ticket_id': ticketId,
        'p_target_queue': target.code,
        'p_notes': notes,
      });

  Future<void> setCounterPaused(int counterId, bool paused) =>
      _rpc('set_counter_status', {'p_counter_id': counterId, 'p_status': paused ? 'PAUSED' : 'ACTIVE'});

  // --- Admin -------------------------------------------------------------

  Future<AdminMetrics> metrics(DateTime date) async =>
      AdminMetrics.fromJson(await _rpc('admin_metrics', {'p_date': _day(date)}));

  Future<List<Ticket>> history(DateTime date) async {
    try {
      final result = await _db.rpc('ticket_history', params: {'p_date': _day(date)});
      return (result as List).map((r) => Ticket.fromJson(Map<String, dynamic>.from(r as Map))).toList();
    } catch (e) {
      throw AppError(friendlyError(e));
    }
  }

  Future<void> updateSettings(Map<String, String> settings) => _rpc('update_settings', {'p_settings': settings});

  Future<List<StaffProfile>> listStaff() async {
    try {
      final result = await _db.rpc('list_staff');
      return (result as List).map((r) => StaffProfile.fromJson(Map<String, dynamic>.from(r as Map))).toList();
    } catch (e) {
      throw AppError(friendlyError(e));
    }
  }

  /// Staff accounts are managed by the manage-staff Edge Function, which
  /// holds the service-role key server-side.
  Future<void> manageStaff(Map<String, dynamic> body) async {
    try {
      await _db.functions.invoke('manage-staff', body: body);
    } catch (e) {
      throw AppError(friendlyError(e));
    }
  }

  static String _day(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  void dispose() {
    _debounce?.cancel();
    _poll?.cancel();
    final channel = _channel;
    if (channel != null) _db.removeChannel(channel);
    _announcements.close();
    super.dispose();
  }
}
