package com.fixbridge.job.dto.request;

import java.util.Map;

public class CancelJobRequest {

  private String reasonCode;
  private String cancellationReasonCode;
  private String reasonLabel;
  private String notes;
  private Map<String, Object> details;

  public String getReasonCode() {
    return reasonCode;
  }

  public void setReasonCode(String reasonCode) {
    this.reasonCode = reasonCode;
  }

  public String getCancellationReasonCode() {
    return cancellationReasonCode;
  }

  public void setCancellationReasonCode(String cancellationReasonCode) {
    this.cancellationReasonCode = cancellationReasonCode;
  }

  public String getReasonLabel() {
    return reasonLabel;
  }

  public void setReasonLabel(String reasonLabel) {
    this.reasonLabel = reasonLabel;
  }

  public String getNotes() {
    return notes;
  }

  public void setNotes(String notes) {
    this.notes = notes;
  }

  public Map<String, Object> getDetails() {
    return details;
  }

  public void setDetails(Map<String, Object> details) {
    this.details = details;
  }
}
