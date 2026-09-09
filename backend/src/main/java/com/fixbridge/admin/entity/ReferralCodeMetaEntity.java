package com.fixbridge.admin.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "referral_code_meta")
public class ReferralCodeMetaEntity {

  @Id
  @Column(name = "user_id")
  private Long userId;

  @Column(nullable = false, unique = true)
  private String code;

  private Boolean disabled = false;

  @Column(name = "regenerated_at")
  private OffsetDateTime regeneratedAt;

  @Column(name = "updated_at")
  private OffsetDateTime updatedAt;

  @PrePersist
  @PreUpdate
  void touch() {
    updatedAt = OffsetDateTime.now();
    if (disabled == null) {
      disabled = false;
    }
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public Boolean getDisabled() {
    return disabled;
  }

  public void setDisabled(Boolean disabled) {
    this.disabled = disabled;
  }

  public OffsetDateTime getRegeneratedAt() {
    return regeneratedAt;
  }

  public void setRegeneratedAt(OffsetDateTime regeneratedAt) {
    this.regeneratedAt = regeneratedAt;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
