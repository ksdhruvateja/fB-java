package com.fixbridge.diy.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.diy.entity.DiyProjectEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.diy.repository.DiyProjectRepository;
import com.fixbridge.security.authorization.SecurityUtils;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class DiyProjectService {

  private final DiyProjectRepository diyProjectRepository;
  private final ObjectMapper objectMapper;

  public DiyProjectService(DiyProjectRepository diyProjectRepository, ObjectMapper objectMapper) {
    this.diyProjectRepository = diyProjectRepository;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    JsonNode plan =
        request != null && request.get("plan") != null
            ? objectMapper.valueToTree(request.get("plan"))
            : objectMapper.createObjectNode();

    String title = null;
    if (request != null && request.get("title") != null) {
      title = String.valueOf(request.get("title"));
    }
    if (!StringUtils.hasText(title) && plan.has("summary")) {
      title = plan.path("summary").asText(null);
    }
    if (!StringUtils.hasText(title)) {
      title = "DIY project";
    }
    if (title.length() > 200) {
      title = title.substring(0, 200);
    }

    Long jobId = null;
    if (request != null && request.get("jobId") != null) {
      try {
        jobId = Long.valueOf(String.valueOf(request.get("jobId")));
      } catch (NumberFormatException ignored) {
        jobId = null;
      }
    }

    DiyProjectEntity project = new DiyProjectEntity();
    project.setUserId(principal.getId());
    project.setJobId(jobId);
    project.setTitle(title);
    project.setPlan(plan);
    project.setStepsCompleted(objectMapper.createArrayNode());
    project.setStatus("active");
    diyProjectRepository.save(project);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("project", toMap(project));
    return body;
  }

  @Transactional(readOnly = true)
  public Map<String, Object> listMine() {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    List<Map<String, Object>> projects =
        diyProjectRepository.findByUserIdOrderByUpdatedAtDesc(principal.getId()).stream()
            .map(this::toMap)
            .toList();
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("projects", projects);
    return body;
  }

  @Transactional
  public Map<String, Object> updateSteps(Long id, Map<String, Object> request) {
    UserPrincipal principal = SecurityUtils.requirePrincipal();
    DiyProjectEntity project =
        diyProjectRepository
            .findByIdAndUserId(id, principal.getId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Not found."));

    Object steps = request == null ? null : request.get("stepsCompleted");
    if (steps instanceof List<?> list) {
      project.setStepsCompleted(objectMapper.valueToTree(list));
    } else {
      project.setStepsCompleted(objectMapper.createArrayNode());
    }
    diyProjectRepository.save(project);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", true);
    body.put("project", toMap(project));
    return body;
  }

  private Map<String, Object> toMap(DiyProjectEntity project) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("id", project.getId());
    map.put("user_id", project.getUserId());
    map.put("job_id", project.getJobId());
    map.put("title", project.getTitle());
    map.put("plan", project.getPlan());
    map.put("steps_completed", project.getStepsCompleted());
    map.put("status", project.getStatus());
    map.put("created_at", project.getCreatedAt());
    map.put("updated_at", project.getUpdatedAt());
    return map;
  }
}
