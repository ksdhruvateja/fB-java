package com.fixbridge.job.dto.request;

public class HomeownerUpdateRequest {

  private String serviceTiming;
  private String preferredDate;
  private String preferredTimeSlot;
  private String description;
  private String contactPhone;
  private String title;

  public String getServiceTiming() {
    return serviceTiming;
  }

  public void setServiceTiming(String serviceTiming) {
    this.serviceTiming = serviceTiming;
  }

  public String getPreferredDate() {
    return preferredDate;
  }

  public void setPreferredDate(String preferredDate) {
    this.preferredDate = preferredDate;
  }

  public String getPreferredTimeSlot() {
    return preferredTimeSlot;
  }

  public void setPreferredTimeSlot(String preferredTimeSlot) {
    this.preferredTimeSlot = preferredTimeSlot;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getContactPhone() {
    return contactPhone;
  }

  public void setContactPhone(String contactPhone) {
    this.contactPhone = contactPhone;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }
}
