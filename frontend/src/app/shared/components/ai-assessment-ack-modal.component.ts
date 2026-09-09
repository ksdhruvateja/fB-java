import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ai-assessment-ack-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (open) {
      <div class="backdrop" role="presentation" (click)="onBackdrop($event)">
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-ack-title"
        >
          <h2 id="ai-ack-title">Before Fixera analyzes your request</h2>
          <div class="body">
            <p>
              Fixera uses AI to summarize your issue and suggest next steps. It is guidance only —
              not a licensed inspection, diagnosis, or emergency service.
            </p>
            <div class="box">
              <p class="eyebrow">Fixera Assessment</p>
              <p>
                Results can be incomplete or wrong. Always use your judgment and follow local codes
                and manufacturer instructions.
              </p>
            </div>
            <div class="box box--warn">
              <p class="eyebrow">Safety</p>
              <p>
                If you smell gas, see sparks, flooding, or anyone is in danger, leave the area and
                call emergency services (911) immediately.
              </p>
            </div>
            <label class="check">
              <input type="checkbox" [(ngModel)]="checkedLocal" (ngModelChange)="checkedChange.emit($event)" />
              <span>I understand this is AI guidance and not a substitute for a professional when safety is at risk.</span>
            </label>
            @if (error) {
              <p class="fb-error" role="alert">{{ error }}</p>
            }
          </div>
          <div class="actions">
            <button type="button" class="fb-btn fb-btn-ghost" [disabled]="busy" (click)="closed.emit()">
              Cancel
            </button>
            <button
              type="button"
              class="fb-btn fb-btn-primary"
              [disabled]="busy || !checkedLocal"
              (click)="continued.emit()"
            >
              {{ busy ? 'Starting…' : 'Continue with AI' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 80;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0.75rem;
      background: rgba(0, 0, 0, 0.5);
    }
    @media (min-width: 640px) {
      .backdrop { align-items: center; }
    }
    .dialog {
      width: min(32rem, 100%);
      max-height: min(92vh, 640px);
      overflow: auto;
      background: var(--card);
      border: 1px solid var(--border);
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
    }
    h2 { font-size: 1.25rem; text-transform: uppercase; }
    .body { display: grid; gap: 0.75rem; color: var(--muted-foreground); font-size: 0.95rem; line-height: 1.5; }
    .body > p { margin: 0; }
    .box { border: 1px solid var(--border); background: var(--secondary); padding: 0.75rem; }
    .box--warn { background: #f8efd2; color: #2c2926; border-color: rgba(0,0,0,0.08); }
    .eyebrow {
      margin: 0 0 0.35rem;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--foreground);
    }
    .check {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      color: var(--foreground);
      font-size: 0.9rem;
    }
    .check input { margin-top: 0.2rem; }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
  `,
})
export class AiAssessmentAckModalComponent {
  @Input() open = false;
  @Input() busy = false;
  @Input() error: string | null = null;
  @Input() set checked(v: boolean) {
    this.checkedLocal = !!v;
  }
  @Output() checkedChange = new EventEmitter<boolean>();
  @Output() closed = new EventEmitter<void>();
  @Output() continued = new EventEmitter<void>();

  checkedLocal = false;

  onBackdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.closed.emit();
  }
}
