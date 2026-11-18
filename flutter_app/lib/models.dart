enum QueueType {
  regular('REGULAR'),
  priority('PRIORITY'),
  complaint('COMPLAINT');

  const QueueType(this.code);
  final String code;

  static QueueType parse(Object? value) =>
      values.firstWhere((q) => q.code == value, orElse: () => QueueType.regular);
}

enum StaffRole {
  admin('ADMIN'),
  guard('GUARD'),
  counter('COUNTER');

  const StaffRole(this.code);
  final String code;

  static StaffRole parse(Object? value) =>
      values.firstWhere((r) => r.code == value, orElse: () => StaffRole.guard);
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

int _int(Object? value) => value is num ? value.toInt() : int.tryParse('$value') ?? 0;

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _list(Object? value) =>
    value is List ? value.map(_map).toList() : const [];

/// A ticket as it appears in lists, on counters and on the display.
class Ticket {
  Ticket({
    required this.id,
    required this.queueNumber,
    required this.queueType,
    this.status,
    this.numberSeq = 0,
    this.createdAt,
    this.calledAt,
    this.completedAt,
    this.counterId,
    this.counterName,
    this.calledByUser,
    this.notes,
  });

  final int id;
  final String queueNumber;
  final QueueType queueType;
  final String? status;
  final int numberSeq;
  final DateTime? createdAt;
  final DateTime? calledAt;
  final DateTime? completedAt;
  final int? counterId;
  final String? counterName;
  final String? calledByUser;
  final String? notes;

  factory Ticket.fromJson(Map<String, dynamic> json) => Ticket(
        id: _int(json['id']),
        queueNumber: '${json['queue_number'] ?? ''}',
        queueType: QueueType.parse(json['queue_type']),
        status: json['status'] as String?,
        numberSeq: _int(json['number_seq']),
        createdAt: _date(json['created_at']),
        calledAt: _date(json['called_at']),
        completedAt: _date(json['completed_at']),
        counterId: json['counter_id'] == null ? null : _int(json['counter_id']),
        counterName: json['counter_name'] as String?,
        calledByUser: json['called_by_user'] as String?,
        notes: json['notes'] as String?,
      );
}

class Counter {
  Counter({
    required this.id,
    required this.name,
    required this.queueType,
    required this.status,
    this.currentTicket,
  });

  final int id;
  final String name;
  final QueueType queueType;
  final String status;
  final Ticket? currentTicket;

  bool get isPaused => status == 'PAUSED';
  bool get isActive => status == 'ACTIVE';

  /// Counters 1 (Regular) and 2 (Priority) cover for each other while one is
  /// paused. Counter 3 (Complaint) never pauses.
  bool get inCoverGroup => queueType == QueueType.regular || queueType == QueueType.priority;

  factory Counter.fromJson(Map<String, dynamic> json) => Counter(
        id: _int(json['id']),
        name: '${json['name'] ?? 'Counter'}',
        queueType: QueueType.parse(json['queue_type']),
        status: '${json['status'] ?? 'ACTIVE'}',
        currentTicket: json['current_ticket'] is Map ? Ticket.fromJson(_map(json['current_ticket'])) : null,
      );
}

/// Everything the screens show, as returned by the queue_snapshot() function.
class QueueSnapshot {
  QueueSnapshot({
    required this.counters,
    required this.waitingCounts,
    required this.waitingTickets,
    required this.skippedTickets,
    required this.recentlyServed,
    required this.settings,
  });

  final List<Counter> counters;
  final Map<QueueType, int> waitingCounts;
  final List<Ticket> waitingTickets;
  final List<Ticket> skippedTickets;
  final List<Ticket> recentlyServed;
  final Map<String, String> settings;

  int get totalWaiting => waitingCounts.values.fold(0, (a, b) => a + b);

  Counter? counter(int id) {
    for (final c in counters) {
      if (c.id == id) return c;
    }
    return null;
  }

  String setting(String key, String fallback) {
    final value = settings[key];
    return value == null || value.trim().isEmpty ? fallback : value;
  }

  String get officeName => setting('office_name', 'Queue Management System');
  String get tagline => setting('office_tagline', 'Queue Management System');

  String prefix(QueueType q) => setting('${q.code.toLowerCase()}_prefix', q.code.substring(0, 1));

  static QueueSnapshot empty() => QueueSnapshot(
        counters: const [],
        waitingCounts: {for (final q in QueueType.values) q: 0},
        waitingTickets: const [],
        skippedTickets: const [],
        recentlyServed: const [],
        settings: const {},
      );

  factory QueueSnapshot.fromJson(Map<String, dynamic> json) {
    final counts = _map(json['waiting_counts']);
    return QueueSnapshot(
      counters: _list(json['counters']).map(Counter.fromJson).toList(),
      waitingCounts: {for (final q in QueueType.values) q: _int(counts[q.code])},
      waitingTickets: _list(json['waiting_tickets']).map(Ticket.fromJson).toList(),
      skippedTickets: _list(json['skipped_tickets']).map(Ticket.fromJson).toList(),
      recentlyServed: _list(json['recently_served']).map(Ticket.fromJson).toList(),
      settings: _map(json['settings']).map((k, v) => MapEntry(k, '$v')),
    );
  }
}

/// A ticket being called (or recalled) to a counter: drives the TV
/// display's flash, chime and voice announcement.
class CallAnnouncement {
  CallAnnouncement({
    required this.ticketId,
    required this.queueNumber,
    required this.queueType,
    required this.counterId,
    required this.counterName,
    required this.isRecall,
  });

  final int ticketId;
  final String queueNumber;
  final QueueType queueType;
  final int counterId;
  final String counterName;
  final bool isRecall;

  factory CallAnnouncement.fromJson(Map<String, dynamic> json, {required bool isRecall}) => CallAnnouncement(
        ticketId: _int(json['id']),
        queueNumber: '${json['queue_number'] ?? ''}',
        queueType: QueueType.parse(json['queue_type']),
        counterId: _int(json['counter_id']),
        counterName: '${json['counter_name'] ?? 'the counter'}',
        isRecall: isRecall,
      );
}

/// A freshly issued ticket, with what the printed receipt needs.
class IssuedTicket {
  IssuedTicket({
    required this.id,
    required this.queueNumber,
    required this.queueType,
    required this.officeName,
    required this.dateFormatted,
    required this.timeFormatted,
  });

  final int id;
  final String queueNumber;
  final QueueType queueType;
  final String officeName;
  final String dateFormatted;
  final String timeFormatted;

  factory IssuedTicket.fromJson(Map<String, dynamic> json) => IssuedTicket(
        id: _int(json['id']),
        queueNumber: '${json['queue_number'] ?? ''}',
        queueType: QueueType.parse(json['queue_type']),
        officeName: '${json['office_name'] ?? ''}',
        dateFormatted: '${json['date_formatted'] ?? ''}',
        timeFormatted: '${json['time_formatted'] ?? ''}',
      );
}

class StaffProfile {
  StaffProfile({
    required this.id,
    required this.username,
    required this.fullName,
    required this.role,
    this.counterId,
  });

  final String id;
  final String username;
  final String fullName;
  final StaffRole role;
  final int? counterId;

  bool get isAdmin => role == StaffRole.admin;
  bool get canIssueTickets => role == StaffRole.guard || role == StaffRole.admin;
  bool canOperateCounter(int counterId) =>
      role == StaffRole.admin || (role == StaffRole.counter && (this.counterId == null || this.counterId == counterId));

  factory StaffProfile.fromJson(Map<String, dynamic> json) => StaffProfile(
        id: '${json['id']}',
        username: '${json['username'] ?? ''}',
        fullName: '${json['full_name'] ?? ''}',
        role: StaffRole.parse(json['role']),
        counterId: json['counter_id'] == null ? null : _int(json['counter_id']),
      );
}

class AdminMetrics {
  AdminMetrics({
    required this.statusCounts,
    required this.queueCounts,
    required this.counterPerformance,
    required this.avgWaitMinutes,
    required this.avgServiceMinutes,
  });

  final Map<String, int> statusCounts;
  final Map<QueueType, int> queueCounts;
  final List<({int counterId, String counterName, int served})> counterPerformance;
  final double avgWaitMinutes;
  final double avgServiceMinutes;

  factory AdminMetrics.fromJson(Map<String, dynamic> json) {
    final queues = _map(json['queue_counts']);
    return AdminMetrics(
      statusCounts: _map(json['status_counts']).map((k, v) => MapEntry(k, _int(v))),
      queueCounts: {for (final q in QueueType.values) q: _int(queues[q.code])},
      counterPerformance: _list(json['counter_performance'])
          .map((r) => (
                counterId: _int(r['counter_id']),
                counterName: '${r['counter_name']}',
                served: _int(r['served_count']),
              ))
          .toList(),
      avgWaitMinutes: (json['avg_wait_minutes'] as num?)?.toDouble() ?? 0,
      avgServiceMinutes: (json['avg_service_minutes'] as num?)?.toDouble() ?? 0,
    );
  }
}
