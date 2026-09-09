import { Component, Input, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/auth.model';
import { GoogleAuthService } from '../../core/services/google-auth.service';
import { GoogleSignInComponent } from '../../shared/components/google-sign-in.component';

@Component({
  selector: 'app-role-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, GoogleSignInComponent],
  templateUrl: './role-login.component.html',
  styleUrl: './role-login.component.scss',
})
export class RoleLoginComponent {
  @Input({ required: true }) role!: UserRole;
  @Input({ required: true }) title!: string;
  @Input() subtitle = 'Sign in to continue';
  @Input() homeLink = '/';
  /** Homeowner + contractor support signup toggle; admin uses MFA instead. */
  @Input() allowSignup = false;
  @Input() requireMfa = false;

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly googleAuth = inject(GoogleAuthService);
  private readonly router = inject(Router);

  mode: 'signin' | 'signup' = 'signin';
  phase: 'credentials' | 'mfa' | 'forgot' = 'credentials';
  loading = false;
  error = '';
  info = '';
  mfaHint = '';

  readonly form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    companyName: [''],
    trade: [''],
  });

  readonly mfaForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(12)]],
  });

  readonly forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  toggleMode(): void {
    if (!this.allowSignup) return;
    this.mode = this.mode === 'signin' ? 'signup' : 'signin';
    this.error = '';
    this.info = '';
    this.phase = 'credentials';
    this.applyPasswordValidators();
  }

  openForgot(): void {
    this.phase = 'forgot';
    this.error = '';
    this.info = '';
    this.forgotForm.patchValue({ email: this.form.controls.email.value });
  }

  backToCredentials(): void {
    this.phase = 'credentials';
    this.error = '';
    this.info = '';
    this.mfaHint = '';
    this.mfaForm.reset({ code: '' });
  }

  private applyPasswordValidators(): void {
    const control = this.form.controls.password;
    if (this.mode === 'signup') {
      control.setValidators([Validators.required, Validators.minLength(6)]);
    } else {
      control.setValidators([Validators.required]);
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  async submit(): Promise<void> {
    if (this.loading) return;
    if (this.mode === 'signup') {
      await this.submitSignup();
      return;
    }
    await this.submitSignIn();
  }

  private async submitSignIn(): Promise<void> {
    this.form.controls.email.markAsTouched();
    this.form.controls.password.markAsTouched();
    if (this.form.controls.email.invalid || this.form.controls.password.invalid) return;

    this.error = '';
    this.loading = true;
    const { email, password } = this.form.getRawValue();

    try {
      const result = await this.auth.signIn(this.role, email.trim(), password);
      if (!result.ok) {
        this.error = result.message;
        return;
      }
      if (result.user.role !== this.role) {
        this.error = `This account is not a ${this.role} account.`;
        this.auth.logout();
        return;
      }
      if (result.mfaRequired || this.requireMfa) {
        this.phase = 'mfa';
        this.info = 'Enter the verification code sent to your email.';
        this.mfaForm.reset({ code: '' });
        this.mfaHint = '';
        const start = await this.auth.mfaStart(false);
        if (!start.ok) {
          this.error = start.message || 'Could not start MFA.';
        } else if (start.demoCode) {
          this.mfaHint = `Demo code: ${start.demoCode}`;
        }
        return;
      }
      await this.router.navigateByUrl(this.dashboardPath(this.role));
    } finally {
      this.loading = false;
    }
  }

  private async submitSignup(): Promise<void> {
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    if (!raw.name.trim()) {
      this.error = 'Name is required.';
      return;
    }
    if (this.form.controls.email.invalid) {
      this.error = this.form.controls.email.hasError('required')
        ? 'Email is required.'
        : 'Enter a valid email address.';
      return;
    }
    if (this.form.controls.password.invalid) {
      this.error = this.form.controls.password.hasError('required')
        ? 'Password is required.'
        : 'Password must be at least 6 characters.';
      return;
    }

    this.error = '';
    this.loading = true;
    try {
      const payload: Record<string, unknown> & {
        role: UserRole;
        name: string;
        email: string;
        password: string;
      } = {
        role: this.role,
        name: raw.name.trim(),
        email: raw.email.trim(),
        password: raw.password,
      };
      if (this.role === 'contractor') {
        if (raw.companyName.trim()) payload['companyName'] = raw.companyName.trim();
        if (raw.trade.trim()) payload['trade'] = raw.trade.trim();
      }
      const result = await this.auth.signUp(payload);
      if (!result.ok) {
        this.error = result.message;
        return;
      }
      await this.router.navigateByUrl(this.dashboardPath(this.role));
    } finally {
      this.loading = false;
    }
  }

  async verifyMfa(): Promise<void> {
    if (this.loading) return;
    this.mfaForm.markAllAsTouched();
    if (this.mfaForm.invalid) {
      this.error = 'Enter the verification code from your email.';
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const code = this.mfaForm.controls.code.value.trim();
      const result = await this.auth.mfaVerify(code);
      if (!result.ok) {
        this.error = result.message;
        return;
      }
      if (result.user.role !== this.role) {
        this.error = `This account is not a ${this.role} account.`;
        this.auth.logout();
        this.phase = 'credentials';
        return;
      }
      await this.router.navigateByUrl(this.dashboardPath(this.role));
    } finally {
      this.loading = false;
    }
  }

  async resendMfa(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      const start = await this.auth.mfaStart(true);
      if (!start.ok) {
        this.error = start.message || 'Could not resend code.';
        return;
      }
      this.info = 'A new code was sent.';
      if (start.demoCode) this.mfaHint = `Demo code: ${start.demoCode}`;
    } finally {
      this.loading = false;
    }
  }

  async submitForgot(): Promise<void> {
    if (this.loading || this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.error = '';
    this.info = '';
    try {
      const email = this.forgotForm.controls.email.value.trim();
      const result = await this.auth.forgotPassword(email, this.role);
      if (!result.ok) {
        this.error = result.message || 'Could not send reset email.';
        return;
      }
      this.info = result.message || 'If that account exists, a reset link is on the way.';
    } finally {
      this.loading = false;
    }
  }

  async onGoogleCredential(credential: string): Promise<void> {
    if (this.loading) return;
    this.error = '';
    this.loading = true;
    try {
      const result = await this.googleAuth.signInWithGoogle(credential, this.role);
      if (!result.ok) {
        this.error = result.message;
        return;
      }
      if (result.user.role !== this.role) {
        this.error = `This account is not a ${this.role} account.`;
        this.auth.logout();
        return;
      }
      await this.router.navigateByUrl(this.dashboardPath(this.role));
    } finally {
      this.loading = false;
    }
  }

  onGoogleError(message: string): void {
    this.error = message;
  }

  private dashboardPath(role: UserRole): string {
    if (role === 'contractor') return '/contractor';
    if (role === 'admin') return '/admin';
    return '/homeowner';
  }
}
