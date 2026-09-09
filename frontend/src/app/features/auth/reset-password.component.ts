import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ResetRole } from '../../core/models/auth.model';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  token = '';
  role: ResetRole = 'homeowner';
  loading = false;
  message = '';
  success = false;

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]],
  });

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.token = q.get('token') || '';
    const role = q.get('role');
    if (role === 'homeowner' || role === 'contractor' || role === 'admin' || role === 'partner') {
      this.role = role;
    }
  }

  async submit(): Promise<void> {
    if (this.loading || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { password, confirm } = this.form.getRawValue();
    if (password !== confirm) {
      this.message = 'Passwords do not match.';
      this.success = false;
      return;
    }
    if (!this.token) {
      this.message = 'Reset link is missing a token. Open the link from your email.';
      this.success = false;
      return;
    }

    this.loading = true;
    this.message = '';
    try {
      const data = await firstValueFrom(
        this.http.post<{ ok: boolean; message?: string }>('/api/auth/reset-password', {
          token: this.token,
          role: this.role,
          password,
        })
      );
      this.success = !!data.ok;
      this.message = data.message || (data.ok ? 'Password updated. You can sign in now.' : 'Could not reset password.');
    } catch {
      this.success = false;
      this.message = 'Network error. Please try again.';
    } finally {
      this.loading = false;
    }
  }
}
