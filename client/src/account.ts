import type { AccountProfile } from '@openrpg/shared';
const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
export class AccountPanel {
  profile: AccountProfile | null = null;
  private mode: 'login' | 'register' = 'login';
  private busy = false;
  private revision = 0;
  constructor(private changed: (profile: AccountProfile | null) => void) {
    for (const mode of ['login', 'register'] as const) element(`tab-${mode}`).onclick = () => {
      this.mode = mode;
      element('auth-submit').textContent = mode === 'login' ? 'Log in →' : 'Create account →';
      element<HTMLInputElement>('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
      for (const option of ['login', 'register']) element(`tab-${option}`).setAttribute('aria-pressed', String(mode === option));
      this.message('');
    };
    element<HTMLFormElement>('auth-form').onsubmit = event => {
      event.preventDefault();
      void this.run(async () => {
        const profile = await this.request<AccountProfile>(`/${this.mode}`, 'POST', {
          username: element<HTMLInputElement>('username').value,
          password: element<HTMLInputElement>('password').value,
        });
        element<HTMLInputElement>('password').value = '';
        this.setProfile(profile); this.message('Welcome, adventurer.');
      });
    };
    element('logout').onclick = () => { void this.run(async () => {
      await this.request('/logout', 'POST', {}); this.setProfile(null); this.message('You are logged out.');
    }); };
    element('delete-toggle').onclick = () => { element('delete-form').hidden = false; element<HTMLInputElement>('delete-password').focus(); };
    element('delete-cancel').onclick = () => { element('delete-form').hidden = true; element<HTMLInputElement>('delete-password').value = ''; };
    element<HTMLFormElement>('delete-form').onsubmit = event => {
      event.preventDefault();
      void this.run(async () => {
        await this.request('/account', 'DELETE', { password: element<HTMLInputElement>('delete-password').value });
        this.setProfile(null); this.message('Your account has been deleted.');
      });
    };
    window.addEventListener('focus', () => { if (!this.busy) void this.restore(); });
  }
  async restore(): Promise<void> {
    const revision = ++this.revision;
    try { const profile = await this.request<AccountProfile>('/me'); if (revision === this.revision) this.setProfile(profile); }
    catch (error) {
      if (revision !== this.revision) return;
      if (error instanceof AccountRequestError && error.status === 401) this.setProfile(null);
      else this.message('Cannot reach your account. Check your connection and try again.');
    }
  }
  private setProfile(profile: AccountProfile | null): void {
    const previous = this.profile;
    this.profile = profile;
    element('auth-guest').hidden = !!profile; element('account-profile').hidden = !profile;
    element('expedition-controls').hidden = !profile;
    element('expedition-locked').hidden = !!profile;
    element('account-badge').textContent = profile ? 'SIGNED IN' : 'YOUR ACCOUNT';
    if (profile) {
      element('account-name').textContent = profile.username;
      element('account-initial').textContent = profile.username[0]!.toUpperCase();
    } else {
      element<HTMLDetailsElement>('account-settings').open = false;
      element('delete-form').hidden = true; element<HTMLInputElement>('delete-password').value = '';
      if (previous) this.showLogin();
    }
    if (previous?.id !== profile?.id) this.changed(profile);
  }
  private showLogin(): void {
    this.mode = 'login'; element('auth-submit').textContent = 'Log in →';
    element<HTMLInputElement>('password').autocomplete = 'current-password';
    element('tab-login').setAttribute('aria-pressed', 'true'); element('tab-register').setAttribute('aria-pressed', 'false');
  }
  private message(text: string): void { element('account-status').textContent = text; }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.revision++;
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#account-panel button'))) button.disabled = true;
    try { this.message('Working…'); await action(); }
    catch (error) { this.message(error instanceof Error ? error.message : 'Account request failed.'); }
    finally { this.busy = false; for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#account-panel button'))) button.disabled = false; }
  }
  private async request<T = void>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/auth${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      throw new AccountRequestError(response.status, data?.error ?? 'Account service unavailable. Please try again.');
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
}
class AccountRequestError extends Error { constructor(readonly status: number, message: string) { super(message); } }
