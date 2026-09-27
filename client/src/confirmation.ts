interface ConfirmationOptions {
  title: string;
  message: string;
  accept: string;
  destructive?: boolean;
}

/** Native modal behavior keeps keyboard focus and Escape handling in the browser. */
export class Confirmation {
  private dialog = document.createElement('dialog');
  private resolve?: (accepted: boolean) => void;

  constructor() {
    this.dialog.id = 'confirmation';
    this.dialog.className = 'confirmation';
    this.dialog.setAttribute('aria-labelledby', 'confirmation-title');
    this.dialog.setAttribute('aria-describedby', 'confirmation-message');
    this.dialog.innerHTML = `<span class="eyebrow">SKIN WORKSHOP</span>
      <h2 id="confirmation-title"></h2><p id="confirmation-message"></p>
      <div class="confirmation-actions"><button id="confirmation-cancel" autofocus>Cancel</button><button id="confirmation-accept"></button></div>`;
    document.body.append(this.dialog);
    this.dialog.querySelector<HTMLButtonElement>('#confirmation-cancel')!.onclick = () => this.finish(false);
    this.dialog.querySelector<HTMLButtonElement>('#confirmation-accept')!.onclick = () => this.finish(true);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.finish(false); });
  }

  ask(options: ConfirmationOptions): Promise<boolean> {
    this.cancel();
    this.dialog.querySelector('#confirmation-title')!.textContent = options.title;
    this.dialog.querySelector('#confirmation-message')!.textContent = options.message;
    const accept = this.dialog.querySelector<HTMLButtonElement>('#confirmation-accept')!;
    accept.textContent = options.accept;
    accept.className = options.destructive ? 'danger' : 'outline-button';
    this.dialog.showModal();
    this.dialog.querySelector<HTMLButtonElement>('#confirmation-cancel')!.focus();
    return new Promise(resolve => { this.resolve = resolve; });
  }

  cancel(): void { this.finish(false); }

  private finish(accepted: boolean): void {
    this.dialog.close();
    this.resolve?.(accepted);
    this.resolve = undefined;
  }
}
