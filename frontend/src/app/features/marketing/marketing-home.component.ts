import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-marketing-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './marketing-home.component.html',
  styleUrl: './marketing-home.component.scss',
})
export class MarketingHomeComponent {}
