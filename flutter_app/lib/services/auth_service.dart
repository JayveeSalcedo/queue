import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../models.dart';
import 'errors.dart';

/// Signed-in staff member and their role. Supabase keeps the session on the
/// device, so a station stays signed in across restarts.
class AuthService extends ChangeNotifier {
  AuthService(this._db);

  final SupabaseClient _db;
  StreamSubscription<AuthState>? _sub;

  StaffProfile? profile;
  bool get isSignedIn => profile != null;

  /// Loads the saved session's profile, then follows sign-in / sign-out.
  Future<void> init() async {
    await _loadProfile();
    _sub = _db.auth.onAuthStateChange.listen((state) {
      if (state.event == AuthChangeEvent.signedOut) {
        profile = null;
        notifyListeners();
      } else if (state.event == AuthChangeEvent.signedIn || state.event == AuthChangeEvent.userUpdated) {
        _loadProfile();
      }
    });
  }

  Future<void> _loadProfile() async {
    final user = _db.auth.currentUser;
    StaffProfile? next;
    if (user != null) {
      try {
        final row = await _db.from('profiles').select().eq('id', user.id).maybeSingle();
        next = row == null ? null : StaffProfile.fromJson(row);
      } catch (_) {
        // Offline at start-up: keep whatever we had rather than signing out
        next = profile;
      }
    }
    if (next?.id != profile?.id || next?.role != profile?.role) {
      profile = next;
      notifyListeners();
    }
  }

  Future<void> signIn(String username, String password) async {
    try {
      await _db.auth.signInWithPassword(email: staffEmail(username), password: password);
    } catch (e) {
      throw AppError(friendlyError(e));
    }
    await _loadProfile();
    if (profile == null) {
      await _db.auth.signOut();
      throw const AppError('This account is not set up as a staff account. Ask your admin.');
    }
  }

  Future<void> signOut() => _db.auth.signOut();

  Future<void> changePassword(String newPassword) async {
    if (newPassword.length < 8) throw const AppError('Use at least 8 characters.');
    try {
      await _db.auth.updateUser(UserAttributes(password: newPassword));
    } catch (e) {
      throw AppError(friendlyError(e));
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
