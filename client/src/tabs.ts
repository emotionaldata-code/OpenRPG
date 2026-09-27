/** Native buttons with the WAI-ARIA tab keyboard pattern. */
export class Tabs {
  constructor(private root: HTMLElement, private changed: (id: string) => void = () => {}) {
    const buttons = this.buttons;
    for (const button of buttons) {
      button.onclick = () => this.select(button.id);
      button.onkeydown = event => {
        const index = buttons.indexOf(button);
        const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); this.select(buttons[next]!.id); buttons[next]!.focus();
      };
    }
    this.select(buttons.find(button => button.getAttribute('aria-selected') === 'true')!.id);
  }
  private get buttons(): HTMLButtonElement[] { return Array.from(this.root.querySelectorAll<HTMLButtonElement>('[role=tab]')); }
  select(id: string): void {
    for (const button of this.buttons) {
      const active = button.id === id;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')!)!.hidden = !active;
    }
    this.changed(id);
  }
}
