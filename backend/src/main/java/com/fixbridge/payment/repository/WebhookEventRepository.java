package com.fixbridge.payment.repository;

import com.fixbridge.payment.entity.WebhookEventEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WebhookEventRepository extends JpaRepository<WebhookEventEntity, Long> {

  Optional<WebhookEventEntity> findByProviderAndEventId(String provider, String eventId);
}
