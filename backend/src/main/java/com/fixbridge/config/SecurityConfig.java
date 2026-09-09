package com.fixbridge.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.util.HashMap;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.fixbridge.security.filter.JwtAuthenticationFilter;
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

  private final JwtAuthenticationFilter jwtAuthenticationFilter;
  private final ObjectMapper objectMapper;

  public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, ObjectMapper objectMapper) {
    this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    this.objectMapper = objectMapper;
  }

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .csrf(AbstractHttpConfigurer::disable)
        .cors(Customizer.withDefaults())
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
            .requestMatchers(
                "/api/auth/signin",
                "/api/auth/signup",
                "/api/auth/forgot-password",
                "/api/auth/reset-password",
                "/api/auth/google",
                "/api/auth/google/config",
                "/api/health",
                "/api/stripe/webhook",
                "/api/address/status",
                "/api/service-area/check",
                "/api/home-services",
                "/api/discounts/lookup",
                "/actuator/health",
                "/actuator/info",
                "/h2-console/**"
            ).permitAll()
            .requestMatchers(HttpMethod.GET, "/api/reviews").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/platform/plans").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/platform/go-pro-plans").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/homecare/config").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/legal/documents").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/legal/documents/**").permitAll()
            .requestMatchers("/api/public/**").permitAll()
            .requestMatchers("/api/partner/login").permitAll()
            .requestMatchers(HttpMethod.GET, "/api/partners/lookup").permitAll()
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .requestMatchers("/api/contractor/**").hasRole("CONTRACTOR")
            .anyRequest().authenticated()
        )
        .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
        .exceptionHandling(ex -> ex
            .authenticationEntryPoint((request, response, authException) ->
                writeJson(response, HttpServletResponse.SC_UNAUTHORIZED, "Authentication required."))
            .accessDeniedHandler((request, response, accessDeniedException) ->
                writeJson(response, HttpServletResponse.SC_FORBIDDEN, "Access denied."))
        )
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

    return http.build();
  }

  private void writeJson(HttpServletResponse response, int status, String message) throws java.io.IOException {
    response.setStatus(status);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    Map<String, Object> body = new HashMap<>();
    body.put("ok", false);
    body.put("message", message);
    objectMapper.writeValue(response.getOutputStream(), body);
  }
}
