package com.fixbridge.config;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.ByteArrayHttpMessageConverter;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Prefer {@link ByteArrayHttpMessageConverter} so Stripe webhook endpoints receive an unparsed
 * raw body for signature verification.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

  @Override
  public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
    // Ensure byte[] converter is present and before Jackson for application/json byte[] params.
    converters.removeIf(c -> c instanceof ByteArrayHttpMessageConverter);
    converters.add(0, new ByteArrayHttpMessageConverter());
    // Keep Jackson available for normal DTOs
    boolean hasJackson =
        converters.stream().anyMatch(c -> c instanceof MappingJackson2HttpMessageConverter);
    if (!hasJackson) {
      converters.add(new MappingJackson2HttpMessageConverter());
    }
  }
}
