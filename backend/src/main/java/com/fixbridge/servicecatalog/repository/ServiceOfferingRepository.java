package com.fixbridge.servicecatalog.repository;

import com.fixbridge.servicecatalog.entity.ServiceOfferingEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceOfferingRepository extends JpaRepository<ServiceOfferingEntity, String> {

  List<ServiceOfferingEntity> findByActiveTrueAndHomeownerVisibleTrueOrderBySortOrderAscNameAsc();

  List<ServiceOfferingEntity> findAllByOrderBySortOrderAscNameAsc();

  Optional<ServiceOfferingEntity> findBySlug(String slug);
}
