#!/bin/bash

# EcoWatt Cloud Remote Configuration API Test Script
# This script tests the remote configuration endpoints

set -e  # Exit on any error

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000/api}"
DEVICE_ID="${DEVICE_ID:-esp32_test_$(date +%s)}"
TEST_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Test functions
test_config_endpoint() {
    print_header "Testing Configuration Update Endpoint"
    
    # Test 1: Valid configuration
    print_info "Test 1: Valid configuration with both parameters"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST \
        "${API_BASE_URL}/device/config" \
        -H "Content-Type: application/json" \
        -H "x-device-id: ${DEVICE_ID}" \
        -d '{
            "config_update": {
                "sampling_interval": 10,
                "registers": ["voltage", "current", "frequency"]
            }
        }')
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Valid configuration accepted (HTTP $HTTP_CODE)"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    elif [ "$HTTP_CODE" -eq 502 ] || [ "$HTTP_CODE" -eq 504 ]; then
        print_warning "Configuration sent but ESP32 communication failed (HTTP $HTTP_CODE) - Expected in test environment"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    else
        print_error "Unexpected response (HTTP $HTTP_CODE)"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 2: Invalid sampling interval
    print_info "Test 2: Invalid sampling interval (should fail validation)"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST \
        "${API_BASE_URL}/device/config" \
        -H "Content-Type: application/json" \
        -H "x-device-id: ${DEVICE_ID}" \
        -d '{
            "config_update": {
                "sampling_interval": 5000,
                "registers": ["voltage"]
            }
        }')
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 400 ]; then
        print_success "Invalid sampling interval rejected (HTTP $HTTP_CODE)"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    else
        print_error "Expected validation error (HTTP 400), got HTTP $HTTP_CODE"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 3: Invalid registers
    print_info "Test 3: Invalid registers (should fail validation)"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST \
        "${API_BASE_URL}/device/config" \
        -H "Content-Type: application/json" \
        -H "x-device-id: ${DEVICE_ID}" \
        -d '{
            "config_update": {
                "sampling_interval": 5,
                "registers": ["invalid_register", "another_invalid"]
            }
        }')
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 400 ]; then
        print_success "Invalid registers rejected (HTTP $HTTP_CODE)"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    else
        print_error "Expected validation error (HTTP 400), got HTTP $HTTP_CODE"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 4: Empty configuration
    print_info "Test 4: Empty configuration (should fail validation)"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST \
        "${API_BASE_URL}/device/config" \
        -H "Content-Type: application/json" \
        -H "x-device-id: ${DEVICE_ID}" \
        -d '{
            "config_update": {}
        }')
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 400 ]; then
        print_success "Empty configuration rejected (HTTP $HTTP_CODE)"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    else
        print_error "Expected validation error (HTTP 400), got HTTP $HTTP_CODE"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 5: Only sampling interval
    print_info "Test 5: Only sampling interval"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST \
        "${API_BASE_URL}/device/config" \
        -H "Content-Type: application/json" \
        -H "x-device-id: ${DEVICE_ID}" \
        -d '{
            "config_update": {
                "sampling_interval": 30
            }
        }')
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 502 ] || [ "$HTTP_CODE" -eq 504 ]; then
        print_success "Single parameter configuration processed (HTTP $HTTP_CODE)"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    else
        print_error "Unexpected response (HTTP $HTTP_CODE)"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 6: Only registers
    print_info "Test 6: Only registers"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST \
        "${API_BASE_URL}/device/config" \
        -H "Content-Type: application/json" \
        -H "x-device-id: ${DEVICE_ID}" \
        -d '{
            "config_update": {
                "registers": ["vac1", "iac1", "temperature"]
            }
        }')
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 502 ] || [ "$HTTP_CODE" -eq 504 ]; then
        print_success "Registers-only configuration processed (HTTP $HTTP_CODE)"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    else
        print_error "Unexpected response (HTTP $HTTP_CODE)"
        echo "$BODY"
    fi
}

test_logs_endpoint() {
    print_header "Testing Configuration Logs Endpoint"
    
    # Test 1: Basic logs retrieval
    print_info "Test 1: Basic logs retrieval"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        "${API_BASE_URL}/device/config/logs")
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Logs retrieved successfully (HTTP $HTTP_CODE)"
        echo "$BODY" | jq '.summary' 2>/dev/null || echo "$BODY"
    else
        print_error "Failed to retrieve logs (HTTP $HTTP_CODE)"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 2: Logs with limit
    print_info "Test 2: Logs with limit parameter"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        "${API_BASE_URL}/device/config/logs?limit=5")
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Limited logs retrieved successfully (HTTP $HTTP_CODE)"
        RECORD_COUNT=$(echo "$BODY" | jq '.pagination.returned_count' 2>/dev/null || echo "unknown")
        print_info "Records returned: $RECORD_COUNT"
    else
        print_error "Failed to retrieve limited logs (HTTP $HTTP_CODE)"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 3: Logs filtered by device ID
    print_info "Test 3: Logs filtered by device ID"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        "${API_BASE_URL}/device/config/logs?device_id=${DEVICE_ID}&limit=10")
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Device-filtered logs retrieved successfully (HTTP $HTTP_CODE)"
        RECORD_COUNT=$(echo "$BODY" | jq '.pagination.returned_count' 2>/dev/null || echo "unknown")
        print_info "Records for device $DEVICE_ID: $RECORD_COUNT"
    else
        print_error "Failed to retrieve device-filtered logs (HTTP $HTTP_CODE)"
        echo "$BODY"
    fi
    
    sleep $TEST_DELAY
    
    # Test 4: Logs filtered by status
    print_info "Test 4: Logs filtered by status"
    
    RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        "${API_BASE_URL}/device/config/logs?status=FAILED&limit=5")
    
    HTTP_CODE=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Status-filtered logs retrieved successfully (HTTP $HTTP_CODE)"
        RECORD_COUNT=$(echo "$BODY" | jq '.pagination.returned_count' 2>/dev/null || echo "unknown")
        print_info "FAILED records: $RECORD_COUNT"
    else
        print_error "Failed to retrieve status-filtered logs (HTTP $HTTP_CODE)"
        echo "$BODY"
    fi
}

test_cors() {
    print_header "Testing CORS Support"
    
    # Test OPTIONS request for config endpoint
    print_info "Test 1: OPTIONS request for config endpoint"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
        "${API_BASE_URL}/device/config" \
        -H "Origin: http://localhost:3001")
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Config endpoint CORS supported (HTTP $HTTP_CODE)"
    else
        print_error "Config endpoint CORS failed (HTTP $HTTP_CODE)"
    fi
    
    # Test OPTIONS request for logs endpoint
    print_info "Test 2: OPTIONS request for logs endpoint"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
        "${API_BASE_URL}/device/config/logs" \
        -H "Origin: http://localhost:3001")
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Logs endpoint CORS supported (HTTP $HTTP_CODE)"
    else
        print_error "Logs endpoint CORS failed (HTTP $HTTP_CODE)"
    fi
}

# Main execution
main() {
    print_header "EcoWatt Cloud Remote Configuration API Test Suite"
    print_info "Testing API at: $API_BASE_URL"
    print_info "Using device ID: $DEVICE_ID"
    print_info "Test delay: ${TEST_DELAY}s between requests"
    
    # Check if API is reachable
    print_info "Checking API availability..."
    if ! curl -s -f "${API_BASE_URL}/data" > /dev/null; then
        print_error "API not reachable at $API_BASE_URL"
        print_info "Make sure the Next.js server is running: npm run dev"
        exit 1
    fi
    print_success "API is reachable"
    
    # Run tests
    test_config_endpoint
    test_logs_endpoint
    test_cors
    
    print_header "Test Summary"
    print_success "All tests completed!"
    print_info "Check the logs endpoint to see all configuration attempts logged in the database"
    print_info "Example: curl '${API_BASE_URL}/device/config/logs?device_id=${DEVICE_ID}'"
}

# Show usage if help is requested
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "EcoWatt Cloud Remote Configuration API Test Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Environment Variables:"
    echo "  API_BASE_URL    Base URL for the API (default: http://localhost:3000/api)"
    echo "  DEVICE_ID       Device ID to use in tests (default: esp32_test_<timestamp>)"
    echo ""
    echo "Options:"
    echo "  --help, -h      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Run tests with defaults"
    echo "  API_BASE_URL=http://localhost:3001/api $0  # Test different API URL"
    echo "  DEVICE_ID=my_test_device $0           # Use specific device ID"
    exit 0
fi

# Run main function
main "$@"