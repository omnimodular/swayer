@status @production
Feature: API status endpoint
  # Including / and /health

  Scenario: The status endpoint is returning 200 when requested
    When requesting GET /
    Then response status is 200
    And response "status" is "pass"
