package com.fixbridge.property.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fixbridge.property.entity.PropertyDocumentEntity;
import com.fixbridge.property.entity.PropertyEntity;
import com.fixbridge.exception.ApiException;
import com.fixbridge.property.repository.PropertyDocumentRepository;
import com.fixbridge.security.principal.UserPrincipal;
import java.util.List;
import java.util.Map;
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
class PropertyDocumentServiceTest {

  @Mock private PropertyDocumentRepository documentRepository;
  @Mock private PropertyService propertyService;

  private PropertyDocumentService service;

  @BeforeEach
  void setUp() {
    service = new PropertyDocumentService(documentRepository, propertyService);
  }

  @AfterEach
  void tearDown() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void list_scopesToOwnerDocumentsOnly() {
    setPrincipal(10L, "homeowner");
    PropertyEntity property = new PropertyEntity();
    property.setId(5L);
    property.setOwnerUserId(10L);
    when(propertyService.loadOwnedOrAdmin(eq(5L), any())).thenReturn(property);
    when(documentRepository.findByPropertyIdAndOwnerUserIdOrderByCreatedAtDesc(5L, 10L))
        .thenReturn(List.of());

    Map<String, Object> body = service.list(5L);

    assertEquals(true, body.get("ok"));
    verify(documentRepository).findByPropertyIdAndOwnerUserIdOrderByCreatedAtDesc(5L, 10L);
    verify(documentRepository, never())
        .findByPropertyIdAndOwnerUserIdOrderByCreatedAtDesc(eq(5L), eq(99L));
  }

  @Test
  void delete_rejectsForeignDocumentEvenIfPropertyIdGuessed() {
    setPrincipal(10L, "homeowner");
    PropertyEntity property = new PropertyEntity();
    property.setId(5L);
    property.setOwnerUserId(10L);
    when(propertyService.loadOwnedOrAdmin(eq(5L), any())).thenReturn(property);
    when(documentRepository.findByIdAndPropertyIdAndOwnerUserId(77L, 5L, 10L))
        .thenReturn(Optional.empty());

    ApiException ex = assertThrows(ApiException.class, () -> service.delete(5L, 77L));
    assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
  }

  @Test
  void upload_setsOwnerUserIdFromProperty() {
    setPrincipal(10L, "homeowner");
    PropertyEntity property = new PropertyEntity();
    property.setId(5L);
    property.setOwnerUserId(10L);
    when(propertyService.loadOwnedOrAdmin(eq(5L), any())).thenReturn(property);
    when(documentRepository.countByPropertyId(5L)).thenReturn(0L);
    when(documentRepository.save(any(PropertyDocumentEntity.class)))
        .thenAnswer(
            inv -> {
              PropertyDocumentEntity e = inv.getArgument(0);
              e.setId(1L);
              return e;
            });

    Map<String, Object> body =
        service.upload(
            5L,
            Map.of(
                "dataUrl",
                "data:image/jpeg;base64,abc",
                "category",
                "receipt",
                "fileName",
                "receipt.jpg"));

    ArgumentCaptor<PropertyDocumentEntity> captor =
        ArgumentCaptor.forClass(PropertyDocumentEntity.class);
    verify(documentRepository).save(captor.capture());
    assertEquals(10L, captor.getValue().getOwnerUserId());
    assertEquals(5L, captor.getValue().getPropertyId());
    assertEquals(true, body.get("ok"));
  }

  private static void setPrincipal(Long id, String role) {
    UserPrincipal principal =
        new UserPrincipal(id, role, role + "@example.com", false, "complete");
    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
  }
}
