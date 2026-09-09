import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { GoogleAuthService } from '../../core/services/google-auth.service';

@Component({
  selector: 'app-google-sign-in',
  standalone: true,
  template: `
    @if (loadError) {
      <div class="gis-warn">
        Google sign-in is temporarily unavailable. Use email and password, or try again shortly.
      </div>
    } @else if (configured !== false) {
      <div class="gis" [class.gis--disabled]="disabled">
        @if (!ready) {
          <div class="gis-loading">Loading Google…</div>
        }
        <div #container [class.gis-hidden]="!ready"></div>
      </div>
    }
  `,
  styles: `
    .gis-warn {
      border: 1px solid #fcd34d;
      background: #fffbeb;
      color: #78350f;
      border-radius: 0.75rem;
      padding: 0.65rem 0.75rem;
      font-size: 0.75rem;
      text-align: center;
    }
    .gis { width: 100%; }
    .gis--disabled { pointer-events: none; opacity: 0.5; }
    .gis-loading {
      display: flex;
      height: 2.75rem;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 999px;
      font-size: 0.875rem;
      color: var(--muted-foreground);
    }
    .gis-hidden { display: none; }
  `,
})
export class GoogleSignInComponent implements OnInit, OnDestroy {
  @Input() disabled = false;
  @Input() text: 'signin_with' | 'signup_with' | 'continue_with' = 'continue_with';
  @Output() credential = new EventEmitter<string>();
  @Output() failed = new EventEmitter<string>();

  @ViewChild('container') containerRef?: ElementRef<HTMLDivElement>;

  private readonly googleAuth = inject(GoogleAuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private cancelled = false;

  ready = false;
  configured: boolean | null = null;
  loadError: string | null = null;

  ngOnInit(): void {
    void this.init();
  }

  ngOnDestroy(): void {
    this.cancelled = true;
  }

  private async init(): Promise<void> {
    try {
      const cfg = await this.googleAuth.getConfig();
      if (this.cancelled) return;
      if (!cfg.ok || !cfg.googleOAuthEnabled || !cfg.configured || !cfg.clientId) {
        this.configured = false;
        return;
      }
      this.configured = true;
      this.cdr.detectChanges();
      await this.googleAuth.loadGis();
      if (this.cancelled) return;

      const el = this.containerRef?.nativeElement;
      if (!el || !window.google?.accounts?.id) return;

      window.google.accounts.id.initialize({
        client_id: cfg.clientId,
        ux_mode: 'popup',
        callback: (response: { credential?: string; error?: string }) => {
          if (response?.credential) {
            this.credential.emit(response.credential);
            return;
          }
          this.failed.emit('We could not complete Google sign-in. Please try again.');
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: false,
        itp_support: true,
      });
      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: this.text,
        width: 320,
        locale: 'en',
      });
      this.ready = true;
      this.cdr.markForCheck();
    } catch (err) {
      if (!this.cancelled) {
        this.configured = false;
        this.loadError =
          err instanceof Error ? err.message : 'Could not load Google Sign-In.';
        this.failed.emit(this.loadError);
      }
    }
  }
}
