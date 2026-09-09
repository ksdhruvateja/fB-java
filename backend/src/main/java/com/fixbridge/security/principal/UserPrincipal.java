package com.fixbridge.security.principal;

import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * Authenticated principal derived from JWT claims.
 * Admin access requires role == "admin"; never trust isAdmin alone.
 */
public class UserPrincipal implements UserDetails {

  private final Long id;
  private final String role;
  private final String email;
  private final boolean isAdmin;
  private final String authStage;

  public UserPrincipal(Long id, String role, String email, boolean isAdmin, String authStage) {
    this.id = id;
    this.role = role;
    this.email = email;
    this.isAdmin = "admin".equals(role);
    this.authStage = authStage != null ? authStage : "complete";
  }

  public Long getId() {
    return id;
  }

  public String getRole() {
    return role;
  }

  public String getEmail() {
    return email;
  }

  public boolean isAdmin() {
    return isAdmin;
  }

  public String getAuthStage() {
    return authStage;
  }

  public boolean isMfaPending() {
    return "mfa_pending".equals(authStage);
  }

  @Override
  public Collection<? extends GrantedAuthority> getAuthorities() {
    List<GrantedAuthority> authorities = new java.util.ArrayList<>();
    authorities.add(new SimpleGrantedAuthority("ROLE_" + String.valueOf(role).toUpperCase()));
    if (isAdmin) {
      authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }
    return authorities;
  }

  @Override
  public String getPassword() {
    return null;
  }

  @Override
  public String getUsername() {
    return email;
  }

  @Override
  public boolean isAccountNonExpired() {
    return true;
  }

  @Override
  public boolean isAccountNonLocked() {
    return true;
  }

  @Override
  public boolean isCredentialsNonExpired() {
    return true;
  }

  @Override
  public boolean isEnabled() {
    return true;
  }
}
