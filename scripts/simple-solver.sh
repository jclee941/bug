#!/bin/bash
set -e

EMAIL="qws941@kakao.com"
PASSWORD="+4ng_YN7:8'46DM5e3\u0026j|KqK2ap|8y=-"
COOKIE_JAR="/tmp/portswigger_cookies.txt"

# Login
echo "Logging in..."
curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
	-d "EmailAddress=$EMAIL" \
	-d "Password=$PASSWORD" \
	-d "RememberMe=false" \
	-L \
	"https://portswigger.net/users" >/dev/null

# Get all labs
echo "Getting labs..."
curl -s -b "$COOKIE_JAR" "https://portswigger.net/web-security/all-labs" >/tmp/all-labs.html

# Function to get lab URL from a lab path
get_lab_url() {
	local lab_path="$1"

	# Get the lab page
	local lab_page=$(curl -s -b "$COOKIE_JAR" "https://portswigger.net$lab_path")

	# Extract the ACCESS THE LAB link
	local access_link=$(echo "$lab_page" | grep -o 'href="[^"]*web-security-academy.net[^"]*"' | head -1 | sed 's/href="//;s/"$//')

	if [ -n "$access_link" ]; then
		echo "$access_link"
		return 0
	fi

	# Try to find any web-security-academy.net link
	access_link=$(echo "$lab_page" | grep -o 'https://[a-z0-9]*\.web-security-academy\.net[^"]*' | head -1)

	if [ -n "$access_link" ]; then
		echo "$access_link"
		return 0
	fi

	return 1
}

# Test with BusinessLogic #5
echo "Testing BusinessLogic #5..."
LAB_URL=$(get_lab_url "/web-security/logic-flaws/lab-low-level")
if [ -n "$LAB_URL" ]; then
	echo "Lab URL: $LAB_URL"

	# Wait for lab to initialize
	echo "Waiting for lab to initialize..."
	sleep 30

	# Run solver
	echo "Running solver..."
	python3 "/tmp/wsa-solutions/BusinessLogic/exploit-lab05.py" -U "$LAB_URL" 2>&1 || true

	# Verify
	echo "Verifying..."
	sleep 5
	RESULT=$(curl -s -k "$LAB_URL" | grep -i "congratulations" || true)
	if [ -n "$RESULT" ]; then
		echo "SOLVED!"
	else
		echo "Not solved"
	fi
else
	echo "Failed to get lab URL"
fi
