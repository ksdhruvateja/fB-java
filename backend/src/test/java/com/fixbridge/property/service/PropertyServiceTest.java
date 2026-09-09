package com.fixbridge.property.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fixbridge.property.dto.request.PropertyCreateRequest;
import com.fixbridge.property.dto.response.PropertyDto;
import com.fixbridge.property.entity.PropertyEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.property.mapper.PropertyMapper;
import com.fixbridge.property.repository.PropertyRepository;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

@ExtendWith(MockitoExtension.class)
class PropertyServiceTest {

  @Mock
  private PropertyRepository propertyRepository;

  private PropertyService propertyService;

  @BeforeEach
  void setUp() {
    ObjectMapper objectMapper = new ObjectMapper();
    propertyService =
        new PropertyService(propertyRepository, new PropertyMapper(objectMapper), objectMapper);
  }

  @AfterEach
  void tearDown() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void listMine_returnsOnlyAuthenticatedOwnerProperties() {
    setPrincipal(10L, "homeowner");
    PropertyEntity owned = new PropertyEntity();
    owned.setId(1L);
    owned.setOwnerUserId(10L);
    owned.setAddressLine1("123 Main");
    when(propertyRepository.findByOwnerUserIdOrderByCreatedAtAscIdAsc(10L)).thenReturn(List.of(owned));

    List<PropertyDto> result = propertyService.listMine();

    assertEquals(1, result.size());
    assertEquals(1L, result.get(0).getId());
    verify(propertyRepository).findByOwnerUserIdOrderByCreatedAtAscIdAsc(10L);
  }

  @Test
  void getById_hidesOtherHomeownerProperty() {
    setPrincipal(10L, "homeowner");
    when(propertyRepository.findByIdAndOwnerUserId(99L, 10L)).thenReturn(Optional.empty());

    ApiException ex = assertThrows(ApiException.class, () -> propertyService.getById(99L));
    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
  }

  @Test
  void create_persistsOwnerUserIdFromAuth() {
    setPrincipal(42L, "homeowner");
    when(propertyRepository.countByOwnerUserId(42L)).thenReturn(0L);
    when(propertyRepository.save(any(PropertyEntity.class))).thenAnswer(inv -> {
      PropertyEntity e = inv.getArgument(0);
      e.setId(7L);
      return e;
    });

    PropertyCreateRequest request = new PropertyCreateRequest();
    request.setAddressLine1("100 Oak St");
    request.setCity("Austin");
    request.setState("TX");
    request.setZip("78701");

    PropertyDto dto = propertyService.create(request);

    ArgumentCaptor<PropertyEntity> captor = ArgumentCaptor.forClass(PropertyEntity.class);
    verify(propertyRepository).save(captor.capture());
    assertEquals(42L, captor.getValue().getOwnerUserId());
    assertEquals(7L, dto.getId());
    assertTrue(dto.getLabel().startsWith("My Home"));
  }

  private static void setPrincipal(Long id, String role) {
    UserPrincipal principal = new UserPrincipal(id, role, role + "@example.com", false, "complete");
    SecurityContextHolder.getContext()
        .setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
  }
}
