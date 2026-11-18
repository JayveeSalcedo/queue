import 'package:flutter_test/flutter_test.dart';
import 'package:queue_app/config.dart';
import 'package:queue_app/models.dart';
import 'package:queue_app/services/announcer.dart';
import 'package:queue_app/services/printer_service.dart';

void main() {
  test('staff usernames map to an email, real emails are kept', () {
    expect(staffEmail(' Guard '), 'guard@$staffEmailDomain');
    expect(staffEmail('Boss@Office.com'), 'boss@office.com');
  });

  test('snapshot parses the server payload', () {
    final snap = QueueSnapshot.fromJson({
      'counters': [
        {
          'id': 1,
          'name': 'Counter 1',
          'queue_type': 'REGULAR',
          'status': 'ACTIVE',
          'current_ticket': {'id': 9, 'queue_number': 'R-004', 'queue_type': 'REGULAR', 'status': 'CALLED'},
        },
        {'id': 2, 'name': 'Counter 2', 'queue_type': 'PRIORITY', 'status': 'PAUSED', 'current_ticket': null},
      ],
      'waiting_counts': {'REGULAR': 3, 'PRIORITY': 1, 'COMPLAINT': 0, 'TOTAL': 4},
      'waiting_tickets': [
        {'id': 10, 'queue_number': 'R-005', 'queue_type': 'REGULAR', 'number_seq': 5, 'created_at': '2026-11-18T08:48:26+08:00'},
      ],
      'skipped_tickets': [],
      'recently_served': [],
      'settings': {'office_name': 'Test Office', 'regular_prefix': 'X'},
    });
    expect(snap.counter(1)!.currentTicket!.queueNumber, 'R-004');
    expect(snap.counter(2)!.isPaused, isTrue);
    expect(snap.totalWaiting, 4);
    expect(snap.officeName, 'Test Office');
    expect(snap.prefix(QueueType.regular), 'X');
    expect(snap.prefix(QueueType.priority), 'P'); // falls back when not set
    expect(snap.waitingTickets.single.numberSeq, 5);
  });

  test('counter accounts may only operate their own counter', () {
    final c2 = StaffProfile(id: 'a', username: 'counter2', fullName: 'C2', role: StaffRole.counter, counterId: 2);
    expect(c2.canOperateCounter(2), isTrue);
    expect(c2.canOperateCounter(1), isFalse);
    expect(c2.canIssueTickets, isFalse);
    final admin = StaffProfile(id: 'b', username: 'admin', fullName: 'A', role: StaffRole.admin);
    expect(admin.canOperateCounter(3), isTrue);
    expect(admin.canIssueTickets, isTrue);
  });

  test('announcement reads digits one by one', () {
    final call = CallAnnouncement(
      ticketId: 1, queueNumber: 'R-023', queueType: QueueType.regular, counterId: 1, counterName: 'Counter 1', isRecall: false);
    expect(Announcer.spokenText(call), 'Now serving ticket R, 0 2 3, please proceed to Counter 1.');
  });

  test('receipt bytes start with init and end with cut, ASCII only', () {
    final bytes = PrinterService.buildEscPos(IssuedTicket(
      id: 1, queueNumber: 'P-007', queueType: QueueType.priority,
      officeName: 'Café Office', dateFormatted: '18/11/2026', timeFormatted: '08:48 AM'));
    expect(bytes.sublist(0, 2), [0x1B, 0x40]);
    expect(bytes.sublist(bytes.length - 4), [0x1D, 0x56, 0x42, 0x00]);
    final text = String.fromCharCodes(bytes);
    expect(text, contains('P-007'));
    expect(text, contains('Caf? Office')); // non-ASCII replaced, never garbled
  });
}
