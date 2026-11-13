@process @production
Feature: API process endpoint

  Background:
    Given request body "id" is "$id"
      And request body "name" is "$test"
      And request body "steps" has an empty array

  Scenario: Suggested id is preserved
    When requesting POST /
    Then response "id" is "$id"

  ###
  # JSON-schema
  ###

  Scenario: Will add id when not provided
    Given request body "id" is missing
    When requesting POST /
    Then response status is 200
      And response "id" exists

  Scenario: Missing version returns v3
    Given request body "version" is missing
    When requesting POST /
    Then response status is 200
      And response "version" is "v3"
      And platform warn was not called

  Scenario: Explicit v3 returns v3 without warnings
    Given request body "version" is "v3"
    When requesting POST /
    Then response status is 200
      And response "version" is "v3"
      And platform warn was not called

  Scenario: Missing version uses v3 header handling
    Given request body "version" is missing
      And request body pipeline include step "GET" to "local"
      And request body headers has passthrough "X-Content"
      And endpoint "local" responds with header "X-Content" value "dummy"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "X-Content" value "dummy"

  Scenario: Unsupported version will result in 422
    Given request body "version" is "v1"
    When requesting POST /
    Then response status is 422

  Scenario: Missing name will result in 422
    Given request body "name" is missing
    When requesting POST /
    Then response status is 422

  Scenario: Missing steps will result in 422
    Given request body "steps" is missing
    When requesting POST /
    Then response status is 422

  ###
  # Endpoint method cycle
  ###

  Scenario Outline: Support <method> to endpoint "local"
    Given request body pipeline include step "<method>" to "local"
    When requesting POST /
    Then endpoint "local" has been called with method "<method>"

    Examples:
        | method  |
        | GET     |
        | POST    |
        | PUT     |
        | DELETE  |
        | PATCH   |
        | OPTIONS |

  Scenario: GET data from endpoint "local" and POST it to endpoint "remote"
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step "POST" to "remote"
      And endpoint "local" responds with "$data"
    When requesting POST /
    Then response status is 200
      And endpoint "local" has been called with method "GET"
      And endpoint "remote" has been called with body "$data"

  Scenario: Handle three steps with each response changing
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step "POST" to "middle"
      And request body pipeline include step "PUT" to "remote"
      And endpoint "local" responds with "$init"
      And endpoint "middle" responds with "$final"
    When requesting POST /
    Then response status is 200
      And endpoint "middle" has been called with body "$init"
      And endpoint "remote" has been called with body "$final"

  Scenario: POST data to endpoint "local"
    Given request body pipeline include step "POST" to "local"
      And request body pipeline include step 0 body "$test"
    When requesting POST /
    Then endpoint "local" has been called with method "POST"
      And endpoint "local" has been called with body "$test"

  ## Headers

  Scenario: Request with top headers
    Given request body pipeline include step "GET" to "local"
      And request body headers has "Content-Type" value "text/plain"
    When requesting POST /
    Then endpoint "local" has been called with header "Content-Type" value "text/plain"

  Scenario: Request with step body will set Content-Type
    Given request body pipeline include step "POST" to "local"
      And request body pipeline include step 0 body "$test"
    When requesting POST /
    Then endpoint "local" has been called with body "$test"
      And endpoint "local" has been called with header "Content-Type" value "text/plain;charset=UTF-8"

  Scenario: Request with endpoint response Content-Type is carried over on GET
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header "Content-Type" value "test/plain"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "Content-Type" value "test/plain"

  Scenario: Request with top headers will pass it to all endpoints
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step "POST" to "remote"
      And request body headers has "Content-Type" value "text/plain"
    When requesting POST /
    Then endpoint "local" has been called with header "Content-Type" value "text/plain"
      And endpoint "remote" has been called with header "Content-Type" value "text/plain"

  Scenario: Request with step headers will pass it to that endpoint only
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step 0 headers "Content-Type" value "text/plain"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "local" has been called with header "Content-Type" value "text/plain"
      And endpoint "remote" has missing header "Content-Type"

  Scenario: Request with step custom headers will pass it to that endpoint only
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step 0 headers "x-test-header" value "$test"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "local" has been called with header "x-test-header" value "$test"
      And endpoint "remote" has missing header "x-test-header"

  Scenario: Request with endpoint response header Content-Type is copied over
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header "Content-Type" value "text/plain"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "Content-Type" value "text/plain"

  Scenario: Request with endpoint response header X-Content is not copied over
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header "X-Content" value "dummy"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "remote" has missing header "X-Content"

  Scenario: Request with endpoint response is copied over with migrated step headers
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header "Content-Type" value "application/json"
      And request body pipeline include step "POST" to "remote"
      And request body pipeline include step 1 headers "x-test-header" value "$test"
    When requesting POST /
    Then endpoint "remote" has been called with header "Content-Type" value "application/json"
      And endpoint "remote" has been called with header "x-test-header" value "$test"

  Scenario: Request with endpoint response Content-Length is not copied over
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header "Content-Length" value "9001"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "remote" has missing header "Content-Length"

  Scenario: Request with step JSON body ignores previous response Content-Type
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header "Content-Type" value "text/plain"
      And request body pipeline include step "POST" to "remote"
      And request body pipeline include step 1 body JSON '{"key": "value"}'
    When requesting POST /
    Then endpoint "remote" has been called with header "Content-Type" value "application/json"
      And endpoint "remote" has been called with body "{\"key\":\"value\"}"

  Scenario: Explicit v3 preserves Content-Type and passthrough headers
    Given request body "version" is "v3"
      And request body pipeline include step "GET" to "local"
      And request body headers has passthrough "X-Content"
      And endpoint "local" responds with header "Content-Type" value "text/plain"
      And endpoint "local" responds with header "X-Content" value "dummy"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "Content-Type" value "text/plain"
      And endpoint "remote" has been called with header "X-Content" value "dummy"

  Scenario: Request with endpoint response header is only copied over from one step
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header "Content-Type" value "text/plain"
      And request body pipeline include step "GET" to "middle"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "middle" has been called with header "Content-Type" value "text/plain"
      And endpoint "remote" has missing header "Content-Type"

  Scenario: Request with endpoint response step header is copied over once
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step 0 headers passthrough "X-Content"
      And endpoint "local" responds with header "X-Content" value "dummy"
      And request body pipeline include step "POST" to "middle"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then endpoint "middle" has been called with header "X-Content" value "dummy"
      And endpoint "remote" has missing header "X-Content"

  ## Cookies

  Scenario: Request with endpoint response cookies is ignored
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with header cookie value "test=value"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has missing header "Cookie"

  Scenario: Request with endpoint response cookies is passed from list
    Given request body pipeline include step "GET" to "local"
      And request body "cookies" has an empty array
      And request body "cookies" include "test"
      And endpoint "local" responds with header cookie value "test=value"
      And endpoint "local" responds with header cookie value "test2=value"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "Cookie" value "test=value"

  Scenario: Request with endpoint cookies is passed through boolean
    Given request body pipeline include step "GET" to "local"
      And request body "cookies" is true
      And endpoint "local" responds with header cookie value "test=value"
      And endpoint "local" responds with header cookie value "test2=value"
      And request body pipeline include step "GET" to "middle"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "Cookie" value "test=value; test2=value"

  Scenario: Request with endpoint cookies is ignored through boolean
    Given request body pipeline include step "GET" to "local"
      And request body "cookies" is false
      And endpoint "local" responds with header cookie value "test=value"
      And endpoint "local" responds with header cookie value "test2=value"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has missing header "Cookie"

  Scenario: Request with cookies for each step is passed through boolean
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step 0 cookies true
      And endpoint "local" responds with header cookie value "test=value"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "Cookie" value "test=value"

  Scenario: Request with cookies for each step is ignored through boolean
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step 0 cookies false
      And endpoint "local" responds with header cookie value "test=value"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has missing header "Cookie"

  Scenario: Request with cookies for each step is passed from list
    Given request body pipeline include step "GET" to "local"
      And request body pipeline include step 0 cookies "test"
      And endpoint "local" responds with header cookie value "test=value"
      And endpoint "local" responds with header cookie value "test2=value"
      And request body pipeline include step "GET" to "remote"
    When requesting POST /
    Then endpoint "remote" has been called with header "Cookie" value "test=value"

  ###
  # Internal methods
  ###

  Scenario: POST internal data to endpoint "local"
    Given request body pipeline include step body JSON '{"key": "value"}'
      And request body pipeline include step "POST" to "local"
    When requesting POST /
    Then response status is 200
      And endpoint "local" has been called with method "POST"
      And endpoint "local" has been called with body '{"key":"value"}'

  Scenario: Patch data from internal body
    Given request body pipeline include step body JSON '{"test":"first"}'
      And request body pipeline include step patch JSON '[{"op": "replace", "path": "/test", "value": "second"}]'
      And request body pipeline include step "POST" to "local"
    When requesting POST /
    Then response status is 200
      And endpoint "local" has been called with body '{"test":"second"}'

  Scenario: Set pipeline body header "Content-Type" to "text/plain"
    Given request body pipeline include step body "$test"
      And request body pipeline include step 0 headers "Content-Type" value "text/plain"
      And request body pipeline include step "POST" to "remote"
    When requesting POST /
    Then response status is 200
      And endpoint "remote" has been called with body "$test"
      And endpoint "remote" has been called with header "Content-Type" value "text/plain"

  ###
  # Endpoint error handling
  ###

  Scenario: Request failure remains retryable and logs a safe warning
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with error
    When requesting POST /
    Then response status is 503
      And platform warning was called
      And platform trace was not called

  Scenario: Endpoint status is not ok and results in status 400 without trace
    Given request body pipeline include step "GET" to "local"
      And endpoint "local" responds with status 400
    When requesting POST /
    Then response status is 400
      And platform trace was not called
