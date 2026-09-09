package com.fixbridge.job.dto.request;

public class InviteContractorRequest {

  private Long contractorUserId;
  private String message;
  private String requestType;
  private String siteVisitWindow;

  public Long getContractorUserId() {
    return contractorUserId;
  }

  public void setContractorUserId(Long contractorUserId) {
    this.contractorUserId = contractorUserId;
  }

  public String getMessage() {
    return message;
  }

  public void setMessage(String message) {
    this.message = message;
  }

  public String getRequestType() {
    return requestType;
  }

  public void setRequestType(String requestType) {
    this.requestType = requestType;
  }

  public String getSiteVisitWindow() {
    return siteVisitWindow;
  }

  public void setSiteVisitWindow(String siteVisitWindow) {
    this.siteVisitWindow = siteVisitWindow;
  }
}
