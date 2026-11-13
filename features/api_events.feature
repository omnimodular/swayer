@events @production
Feature: Events handling

  Background:
    Given request body "id" is "$id"
      And request body "name" is "$test"
      And request body "steps" has an empty array

  Scenario Outline: Event <event> given <status> responds with <response>
    Given request body event <event> exists
      And endpoint "local" responds with status <local>
      And endpoint "<event>" responds with status <status>
      And request body pipeline include step "GET" to "local"
    When requesting POST /
    Then endpoint "<event>" has been called
      And response status is <response>
      And platform trace was not called

    Examples:
        | event    | status | local | response |
        | precheck | 200    | 200   | 200      |
        | precheck | 404    | 200   | 200      |
        | precheck | 500    | 200   | 503      |
        | success  | 200    | 200   | 200      |
        | success  | 400    | 200   | 503      |
        | failure  | 200    | 400   | 400      |
        | failure  | 400    | 400   | 503      |
        | retry    | 200    | 500   | 500      |

  Scenario Outline: Event <event> given exception responds with error and a safe warning
    Given request body event <event> exists
      And endpoint "local" responds with status <local>
      And endpoint "<event>" responds with error
      And request body pipeline include step "GET" to "local"
    When requesting POST /
    Then endpoint "<event>" has been called
      And response status is <response>
      And platform warning was called
      And platform trace was not called

    Examples:
        | event    | local | response |
        | success  | 200   | 503      |
        | failure  | 400   | 503      |
        | retry    | 500   | 503      |

  Scenario: Event precheck given exception responds with error without trace
    Given request body event precheck exists
      And endpoint "local" responds with status 200
      And endpoint "precheck" responds with error
      And request body pipeline include step "GET" to "local"
    When requesting POST /
    Then endpoint "precheck" has been called
      And response status is 503
      And platform trace was not called
