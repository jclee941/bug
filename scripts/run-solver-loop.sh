#!/bin/bash
# Restart lab-runner in a loop until it completes all labs
export PORTSWIGGER_EMAIL='qws941@kakao.com'
export PORTSWIGGER_PASSWORD='+4ng_YN7:8'"'"'46DM5e3&j|KqK2ap|8y=-'
cd /home/jclee/dev/bug
LOG=/tmp/lab-runner-loop.log
echo "=== Solver loop started $(date) ===" >>"$LOG"

for i in $(seq 1 20); do
	echo "[RUN $i] Starting at $(date)" >>"$LOG"
	node scripts/lab-runner.mjs >>"$LOG" 2>&1
	EXIT=$?
	echo "[RUN $i] Exited with code $EXIT at $(date)" >>"$LOG"

	# Check if final results were printed (meaning full pass completed)
	if grep -q "Overall:" "$LOG"; then
		OVERALL=$(grep "Overall:" "$LOG" | tail -1)
		echo "[RUN $i] Completed: $OVERALL" >>"$LOG"
		# If we reached 270/270 or no more unsolved, stop
		if echo "$OVERALL" | grep -q "270/270"; then
			echo "ALL SOLVED!" >>"$LOG"
			break
		fi
	fi

	echo "[RUN $i] Restarting in 10s..." >>"$LOG"
	sleep 10
done

echo "=== Solver loop finished $(date) ===" >>"$LOG"
