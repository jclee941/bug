#!/bin/bash
set -e

EMAIL="qws941@kakao.com"
PASSWORD="'+4ng_YN7:8'46DM5e3\u0026j|KqK2ap|8y=-'"
COOKIE_JAR="/tmp/portswigger_cookies.txt"

# Clean up
rm -f "$COOKIE_JAR"

# Login
echo "Logging in..."
curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
	-d "EmailAddress=$EMAIL" \
	-d "Password=$PASSWORD" \
	-d "RememberMe=false" \
	-L \
	"https://portswigger.net/users" >/dev/null

echo "Getting all-labs page..."
curl -s -b "$COOKIE_JAR" "https://portswigger.net/web-security/all-labs" >/tmp/all-labs.html

# Extract unsolved labs by topic
# This is tricky with just bash - let me use Python for parsing
python3 <<'EOF'
import re
import json

with open('/tmp/all-labs.html', 'r') as f:
    html = f.read()

# Find all lab links with their topics and solved status
labs = []
pattern = r'<div class="widgetcontainer-lab-link([^"]*)"[^>]*>.*?href="(/web-security/[^"]+)"[^>]*>([^"]+?)</a>'

# Simple regex approach
import re
lab_blocks = re.findall(r'<div class="widgetcontainer-lab-link([^"]*)"[^>]*>(.*?)</div>', html, re.DOTALL)

results = {}
for block in lab_blocks:
    classes, content = block
    is_solved = 'is-solved' in classes
    
    href_match = re.search(r'href="(/web-security/[^"]+)"', content)
    title_match = re.search(r'>([^"]+?)</a>', content)
    
    if href_match and title_match:
        href = href_match.group(1)
        title = title_match.group(1).strip()
        topic_match = re.match(r'/web-security/([^/]+)', href)
        topic = topic_match.group(1) if topic_match else ''
        
        if topic:
            if topic not in results:
                results[topic] = []
            results[topic].append({'title': title, 'href': href, 'isSolved': is_solved})

# Save results
with open('/tmp/all-labs-parsed.json', 'w') as f:
    json.dump(results, f, indent=2)

print(f"Found {sum(len(v) for v in results.values())} labs")
EOF

echo "Done parsing labs"
