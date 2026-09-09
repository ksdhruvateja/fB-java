package com.fixbridge.common.util;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/** Lightweight in-memory sliding-window rate limiter. */
public final class SimpleRateLimiter {

  private final int maxRequests;
  private final Duration window;
  private final ConcurrentHashMap<String, Deque<Instant>> buckets = new ConcurrentHashMap<>();

  public SimpleRateLimiter(int maxRequests, Duration window) {
    this.maxRequests = maxRequests;
    this.window = window;
  }

  public boolean tryAcquire(String key) {
    String k = key == null || key.isBlank() ? "unknown" : key;
    Instant now = Instant.now();
    Instant cutoff = now.minus(window);
    Deque<Instant> q = buckets.computeIfAbsent(k, ignored -> new ArrayDeque<>());
    synchronized (q) {
      while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) {
        q.removeFirst();
      }
      if (q.size() >= maxRequests) {
        return false;
      }
      q.addLast(now);
      return true;
    }
  }
}
