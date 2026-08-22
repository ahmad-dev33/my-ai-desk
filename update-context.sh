#!/bin/bash
echo -e "\e[36mUpdating compact project context...\e[0m"
node .cursor/context-tool/generate.js
echo -e "\e[32mCompact context successfully updated!\e[0m"
