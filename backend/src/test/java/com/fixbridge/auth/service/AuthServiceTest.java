package com.fixbridge.auth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fixbridge.config.FixbridgeProperties;
import com.fixbridge.auth.dto.response.AuthResponse;
import com.fixbridge.auth.dto.request.SignInRequest;
import com.fixbridge.auth.dto.response.UserDto;
import com.fixbridge.auth.entity.UserEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.integration.email.MailService;
import com.fixbridge.integration.highlevel.HighLevelClient;
import com.fixbridge.auth.mapper.UserMapper;
import com.fixbridge.auth.repository.PasswordResetTokenRepository;
import com.fixbridge.auth.repository.UserRepository;
import com.fixbridge.security.jwt.JwtService;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

  @Mock
  private UserRepository userRepository;
  @Mock
  private PasswordResetTokenRepository passwordResetTokenRepository;
  @Mock
  private PasswordEncoder passwordEncoder;
  @Mock
  private JwtService jwtService;
  @Mock
  private UserMapper userMapper;
  @Mock
  private MailService mailService;
  @Mock
  private FixbridgeProperties properties;
  @Mock
  private HighLevelClient highLevelClient;

  private AuthService authService;

  @BeforeEach
  void setUp() {
    authService =
        new AuthService(
            userRepository,
            passwordResetTokenRepository,
            passwordEncoder,
            jwtService,
            userMapper,
            mailService,
            properties,
            highLevelClient);
  }

  @Test
  void signIn_returnsTokenForValidHomeowner() {
    UserEntity user = new UserEntity();
    user.setId(5L);
    user.setRole("homeowner");
    user.setEmail("a@example.com");
    user.setPassword("$2a$hash");
    user.setName("Alex");
    user.setReferralCode("FBABC");
    user.setBlocked(false);

    when(userRepository.findByRoleAndEmailIgnoreCase("homeowner", "a@example.com"))
        .thenReturn(Optional.of(user));
    when(passwordEncoder.matches("secret", "$2a$hash")).thenReturn(true);
    UserDto dto = new UserDto();
    dto.setId(5L);
    dto.setEmail("a@example.com");
    when(userMapper.toDto(user)).thenReturn(dto);
    when(jwtService.createToken(any(UserPrincipal.class))).thenReturn("jwt-token");

    SignInRequest request = new SignInRequest();
    request.setRole("homeowner");
    request.setEmail("a@example.com");
    request.setPassword("secret");

    AuthResponse response = authService.signIn(request);

    assertTrue(response.isOk());
    assertEquals("jwt-token", response.getToken());
    assertEquals(5L, response.getUser().getId());
    assertFalse(Boolean.TRUE.equals(response.getMfaRequired()));
  }

  @Test
  void signIn_rejectsBadPassword() {
    UserEntity user = new UserEntity();
    user.setId(5L);
    user.setRole("homeowner");
    user.setEmail("a@example.com");
    user.setPassword("$2a$hash");
    user.setBlocked(false);

    when(userRepository.findByRoleAndEmailIgnoreCase("homeowner", "a@example.com"))
        .thenReturn(Optional.of(user));
    when(passwordEncoder.matches("wrong", "$2a$hash")).thenReturn(false);

    SignInRequest request = new SignInRequest();
    request.setRole("homeowner");
    request.setEmail("a@example.com");
    request.setPassword("wrong");

    ApiException ex = assertThrows(ApiException.class, () -> authService.signIn(request));
    assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatus());
    verify(jwtService, never()).createToken(any());
  }

  @Test
  void signIn_adminRequiresMfaPendingToken() {
    UserEntity user = new UserEntity();
    user.setId(1L);
    user.setRole("admin");
    user.setEmail("admin@example.com");
    user.setPassword("$2a$hash");
    user.setBlocked(false);
    user.setReferralCode("FBADMIN");

    when(userRepository.findByRoleAndEmailIgnoreCase("admin", "admin@example.com"))
        .thenReturn(Optional.of(user));
    when(passwordEncoder.matches(eq("secret"), anyString())).thenReturn(true);
    when(userMapper.toDto(user)).thenReturn(new UserDto());
    when(jwtService.createMfaPendingToken(any(UserPrincipal.class))).thenReturn("mfa-token");

    SignInRequest request = new SignInRequest();
    request.setRole("admin");
    request.setEmail("admin@example.com");
    request.setPassword("secret");

    AuthResponse response = authService.signIn(request);

    assertTrue(response.isOk());
    assertTrue(Boolean.TRUE.equals(response.getMfaRequired()));
    assertEquals("mfa-token", response.getToken());
  }
}
