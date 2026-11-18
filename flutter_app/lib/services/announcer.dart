import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

import '../models.dart';

/// Chime + spoken announcement for the TV display:
/// "Now serving ticket R, zero two three, please proceed to Counter 1."
/// Announcements play one after another instead of cutting each other off.
class Announcer {
  final FlutterTts _tts = FlutterTts();
  final AudioPlayer _player = AudioPlayer();
  Future<void> _queue = Future.value();
  bool _ready = false;

  Future<void> _init() async {
    if (_ready) return;
    _ready = true;
    try {
      await _tts.awaitSpeakCompletion(true);
      await _tts.setLanguage('en-US');
      await _tts.setVolume(1.0);
      await _player.setReleaseMode(ReleaseMode.stop);
    } catch (_) {
      // Voice is a nice-to-have; the visual display keeps working without it
    }
  }

  /// Browsers block sound until someone taps the page once.
  Future<void> unlock() async {
    await _init();
    await chime();
  }

  Future<void> chime() async {
    try {
      await _player.stop();
      await _player.play(AssetSource('sounds/chime.wav'));
      await Future<void>.delayed(const Duration(milliseconds: 1100));
    } catch (_) {}
  }

  Future<void> _speak(String text, {required double rate, required double pitch}) async {
    try {
      // Web Speech treats 1.0 as normal speed; Android / iOS treat 0.5 as normal
      await _tts.setSpeechRate(kIsWeb ? rate : rate * 0.5);
      await _tts.setPitch(pitch);
      await _tts.speak(text).timeout(const Duration(seconds: 15));
    } catch (_) {}
  }

  static String spokenText(CallAnnouncement call) {
    // "R-023" -> "ticket R, 0 2 3" so it is not read as "R minus twenty-three"
    final parts = call.queueNumber.split('-');
    final ticket = parts.length == 2 ? 'ticket ${parts[0]}, ${parts[1].split('').join(' ')}' : call.queueNumber;
    return 'Now serving $ticket, please proceed to ${call.counterName}.';
  }

  void announce(CallAnnouncement call, {double rate = 0.9, double pitch = 1.0}) {
    Future<void> run() async {
      await _init();
      await chime();
      await _speak(spokenText(call), rate: rate, pitch: pitch);
    }

    _queue = _queue.then((_) => run(), onError: (_) => run());
  }

  void dispose() {
    _player.dispose();
    _tts.stop();
  }
}
