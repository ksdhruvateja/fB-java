package com.fixbridge.job.dto.request;

public class AssignContractorRequest {

  private Long contractorUserId;
  private Long employeeId;
  private Boolean clearEmployee;

  public Long getContractorUserId() {
    return contractorUserId;
  }

  public void setContractorUserId(Long contractorUserId) {
    this.contractorUserId = contractorUserId;
  }

  public Long getEmployeeId() {
    return employeeId;
  }

  public void setEmployeeId(Long employeeId) {
    this.employeeId = employeeId;
  }

  public Boolean getClearEmployee() {
    return clearEmployee;
  }

  public void setClearEmployee(Boolean clearEmployee) {
    this.clearEmployee = clearEmployee;
  }
}
