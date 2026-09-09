import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-marketing-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './marketing-layout.component.html',
  styleUrl: './marketing-layout.component.scss',
})
export class MarketingLayoutComponent {
  readonly year = new Date().getFullYear();
}
