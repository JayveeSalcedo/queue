/// Supabase connection, supplied at build time so the same code works for
/// any office's project:
///
///   flutter run --dart-define-from-file=env.json
///
/// env.json (copy env.example.json):
///   { "SUPABASE_URL": "https://xxxx.supabase.co", "SUPABASE_ANON_KEY": "eyJ..." }
///
/// The anon (public) key is safe to ship in the app: Row Level Security and
/// the database functions decide what each signed-in role may do.
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

bool get isConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

/// Staff sign in with a plain username ("guard", "counter1"). Supabase Auth
/// needs an email, so usernames map to `<username>@<staffEmailDomain>`.
/// Must match STAFF_EMAIL_DOMAIN in supabase/functions/manage-staff and
/// supabase/scripts/create-staff.mjs. No mail is ever sent to it.
const staffEmailDomain = 'staff.example.com';

String staffEmail(String usernameOrEmail) {
  final value = usernameOrEmail.trim().toLowerCase();
  return value.contains('@') ? value : '$value@$staffEmailDomain';
}
