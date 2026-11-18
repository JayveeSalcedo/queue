import 'package:supabase_flutter/supabase_flutter.dart';

/// An error message that is already fit to show to staff.
class AppError implements Exception {
  const AppError(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Turns Supabase / network exceptions into a short readable sentence.
/// Messages raised by the database functions are written for staff already.
String friendlyError(Object error) {
  if (error is AppError) return error.message;
  if (error is PostgrestException) return error.message;
  if (error is AuthException) {
    if (error.message.toLowerCase().contains('invalid login')) return 'Wrong username or password.';
    return error.message;
  }
  if (error is FunctionException) {
    final details = error.details;
    if (details is Map && details['error'] != null) return '${details['error']}';
    return 'Request failed (${error.status}).';
  }
  final text = '$error';
  if (text.contains('SocketException') || text.contains('Failed host lookup') || text.contains('ClientException')) {
    return 'No internet connection. Check the Wi-Fi or mobile data and try again.';
  }
  return text;
}
