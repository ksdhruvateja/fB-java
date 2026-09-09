package com.fixbridge.config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class CorsConfig {

  private final FixbridgeProperties properties;

  public CorsConfig(FixbridgeProperties properties) {
    this.properties = properties;
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(resolveOrigins());
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    config.setExposedHeaders(List.of("Authorization", "Content-Type"));
    config.setAllowCredentials(true);
    config.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }

  private List<String> resolveOrigins() {
    Set<String> origins = new LinkedHashSet<>();
    String appUrl = properties.getAppUrl();
    if (StringUtils.hasText(appUrl)) {
      origins.add(trimTrailingSlash(appUrl.trim()));
    }
    String extra = properties.getCors().getOrigins();
    if (StringUtils.hasText(extra)) {
      Arrays.stream(extra.split(","))
          .map(String::trim)
          .filter(StringUtils::hasText)
          .map(this::trimTrailingSlash)
          .forEach(origins::add);
    }
    if (origins.isEmpty()) {
      origins.add("http://localhost:5000");
      origins.add("http://localhost:5173");
      origins.add("http://127.0.0.1:5000");
    }
    return new ArrayList<>(origins);
  }

  private String trimTrailingSlash(String value) {
    if (value.endsWith("/")) {
      return value.substring(0, value.length() - 1);
    }
    return value;
  }
}
