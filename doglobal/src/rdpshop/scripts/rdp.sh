#!/bin/bash

# =============================================================================
# Auto Install Windows Docker Container
# Creator: Ra Cube
# Description: Script untuk menginstall Windows di Docker Container secara otomatis
# Modified for rdpInstaller.js compatibility
# =============================================================================

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Banner
clear
echo -e "${PURPLE}========================================${NC}"
echo -e "${CYAN}    Auto Install Windows Docker${NC}"
echo -e "${CYAN}         Creator: Ra Cube${NC}"
echo -e "${PURPLE}========================================${NC}"
echo ""

# Fungsi untuk menampilkan loading dengan flush output
loading() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Fungsi untuk progress bar dengan flush output
show_progress() {
    local current=$1
    local total=$2
    local message=$3
    local percent=$((current * 100 / total))
    local filled=$((percent / 2))
    local empty=$((50 - filled))
    
    printf "\r${message}: [%s%s] %d%%" \
        "$(printf '#%.0s' $(seq 1 $filled))" \
        "$(printf ' %.0s' $(seq 1 $empty))" \
        "$percent"
    
    # Flush output immediately
    if command -v stdbuf >/dev/null 2>&1; then
        stdbuf -oL echo ""
    else
        echo ""
    fi
    
    if [ $current -eq $total ]; then
        echo ""
    fi
}

# Fungsi untuk flush output immediately
flush_output() {
    if command -v stdbuf >/dev/null 2>&1; then
        exec stdbuf -oL -eL "$0" "$@"
    fi
}

# Fungsi untuk mengecek sistem
check_system() {
    echo -e "${YELLOW}Checking system...${NC}"
    echo "Checking system..." >&2  # Send to stderr for immediate visibility
    
    # Cek apakah running sebagai root
    if [[ $EUID -ne 0 ]]; then
       echo -e "${RED}Script must be run as root!${NC}"
       echo -e "${YELLOW}Use: sudo $0${NC}"
       exit 1
    fi
    
    # Cek OS
    if [[ ! -f /etc/os-release ]]; then
        echo -e "${RED}Operating system not supported!${NC}"
        exit 1
    fi
    
    # Deteksi spesifikasi VPS otomatis
    CPU_CORES=$(nproc)
    TOTAL_RAM=$(free -g | awk '/^Mem:/{print $2}')
    AVAILABLE_DISK=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    
    echo -e "${GREEN}✓ System detected with specifications:${NC}"
    echo -e "${CYAN}  CPU Cores: ${CPU_CORES}${NC}"
    echo -e "${CYAN}  Total RAM: ${TOTAL_RAM}GB${NC}"
    echo -e "${CYAN}  Available Disk: ${AVAILABLE_DISK}GB${NC}"
    echo ""
}

# Fungsi untuk install Docker
install_docker() {
    echo -e "${YELLOW}Installing Docker...${NC}"
    echo "Installing Docker..." >&2
    
    # Deteksi distribusi Linux
    if [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        echo "Updating package list..." >&2
        apt update -y >/dev/null 2>&1
        
        echo "Installing dependencies..." >&2
        # Install dependencies
        apt install -y apt-transport-https ca-certificates curl gnupg lsb-release software-properties-common >/dev/null 2>&1
        
        echo "Adding Docker GPG key..." >&2
        # Add Docker GPG key
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null
        
        echo "Adding Docker repository..." >&2
        # Add Docker repository
        echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        echo "Installing Docker CE..." >&2
        # Update dan install Docker
        apt update -y >/dev/null 2>&1
        apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
        
    elif [[ -f /etc/redhat-release ]]; then
        # CentOS/RHEL/Rocky/AlmaLinux
        echo "Updating system..." >&2
        yum update -y >/dev/null 2>&1
        
        echo "Installing dependencies..." >&2
        yum install -y yum-utils device-mapper-persistent-data lvm2 >/dev/null 2>&1
        
        echo "Adding Docker repository..." >&2
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo >/dev/null 2>&1
        
        echo "Installing Docker CE..." >&2
        yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
    fi
    
    # Install Docker Compose standalone (fallback)
    echo "Installing Docker Compose..." >&2
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose 2>/dev/null
    chmod +x /usr/local/bin/docker-compose
    
    # Buat symlink untuk docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    
    # Start dan enable Docker
    echo "Starting Docker service..." >&2
    systemctl start docker
    systemctl enable docker
    
    # Add user ke docker group (jika ada user non-root)
    if [[ -n "$SUDO_USER" ]]; then
        usermod -aG docker $SUDO_USER
    fi
    
    echo -e "${GREEN}✓ Docker and Docker Compose successfully installed!${NC}"
}

# Fungsi untuk input otomatis dari stdin
get_automated_input() {
    echo -e "${CYAN}Reading automated configuration...${NC}"
    echo "Reading automated configuration..." >&2
    
    # Baca input dari stdin (dikirim oleh rdpInstaller.js)
    if read -r WINDOWS_ID && read -r RAM_INPUT && read -r CPU_INPUT && read -r STORAGE_INPUT && read -r PASSWORD_INPUT; then
        echo "Configuration received successfully" >&2
    else
        echo "Failed to read configuration from stdin" >&2
        exit 1
    fi
    
    # Mapping Windows ID ke versi
    case $WINDOWS_ID in
        1) VERSION="11"; VERSION_NAME="Windows 11 Pro";;
        2) VERSION="11l"; VERSION_NAME="Windows 11 LTSC";;
        3) VERSION="11e"; VERSION_NAME="Windows 11 Enterprise";;
        4) VERSION="10"; VERSION_NAME="Windows 10 Pro";;
        5) VERSION="10l"; VERSION_NAME="Windows 10 LTSC";;
        6) VERSION="10e"; VERSION_NAME="Windows 10 Enterprise";;
        7) VERSION="8e"; VERSION_NAME="Windows 8.1 Enterprise";;
        8) VERSION="7u"; VERSION_NAME="Windows 7 Ultimate";;
        9) VERSION="vu"; VERSION_NAME="Windows Vista Ultimate";;
        10) VERSION="xp"; VERSION_NAME="Windows XP Professional";;
        11) VERSION="2k"; VERSION_NAME="Windows 2000 Professional";;
        12) VERSION="2025"; VERSION_NAME="Windows Server 2025";;
        13) VERSION="2022"; VERSION_NAME="Windows Server 2022";;
        14) VERSION="2019"; VERSION_NAME="Windows Server 2019";;
        15) VERSION="2016"; VERSION_NAME="Windows Server 2016";;
        16) VERSION="2012"; VERSION_NAME="Windows Server 2012";;
        17) VERSION="2008"; VERSION_NAME="Windows Server 2008";;
        18) VERSION="2003"; VERSION_NAME="Windows Server 2003";;
        *) VERSION="10"; VERSION_NAME="Windows 10 Pro";;  # Default
    esac
    
    # Set spesifikasi
    RAM_SIZE="${RAM_INPUT}G"
    CPU_CORES_SET=$CPU_INPUT
    DISK_SIZE="${STORAGE_INPUT}G"
    
    # Set kredensial default
    USERNAME="Administrator"
    PASSWORD="$PASSWORD_INPUT"
    
    echo -e "${GREEN}✓ Automated configuration:${NC}"
    echo -e "${CYAN}  Version: ${VERSION_NAME}${NC}"
    echo -e "${CYAN}  RAM: ${RAM_SIZE}${NC}"
    echo -e "${CYAN}  CPU: ${CPU_CORES_SET} cores${NC}"
    echo -e "${CYAN}  Storage: ${DISK_SIZE}${NC}"
    echo -e "${CYAN}  Username: ${USERNAME}${NC}"
    echo ""
}

# Fungsi untuk membuat docker-compose.yml
create_compose_file() {
    echo -e "${YELLOW}Creating configuration file...${NC}"
    echo "Creating configuration file..." >&2
    
    mkdir -p /opt/windows-docker
    cd /opt/windows-docker
    
    cat > docker-compose.yml << EOF
services:
  windows:
    image: dockurr/windows
    container_name: windows
    environment:
      VERSION: "${VERSION}"
      USERNAME: "${USERNAME}"
      PASSWORD: "${PASSWORD}"
      RAM_SIZE: "${RAM_SIZE}"
      CPU_CORES: "${CPU_CORES_SET}"
      DISK_SIZE: "${DISK_SIZE}"
      LANGUAGE: "English"
      REGION: "en-US"
      KEYBOARD: "en-US"
    devices:
      - /dev/kvm
      - /dev/net/tun
    cap_add:
      - NET_ADMIN
    ports:
      - 8006:8006
      - 3389:3389/tcp
      - 3389:3389/udp
    volumes:
      - ./windows:/storage
      - ./shared:/data
    restart: always
    stop_grace_period: 2m
EOF
    
    # Buat folder untuk data
    mkdir -p windows shared
    
    echo -e "${GREEN}✓ Configuration file created successfully!${NC}"
}

# Fungsi untuk menjalankan container dengan progress yang kompatibel dengan rdpInstaller.js
run_container() {
    echo "Starting container setup..." >&2
    
    # Cek apakah docker-compose tersedia
    COMPOSE_CMD=""
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        echo "Docker Compose not found! Reinstalling..." >&2
        install_docker
        if command -v docker-compose &> /dev/null; then
            COMPOSE_CMD="docker-compose"
        else
            COMPOSE_CMD="docker compose"
        fi
    fi
    
    # Show initial progress
    echo "Setup process : [                                                  ] 0%"
    
    # Pull image terlebih dahulu
    echo "Downloading Windows image..." >&2
    $COMPOSE_CMD pull >/dev/null 2>&1 &
    PULL_PID=$!
    
    # Progress simulation yang kompatibel dengan rdpInstaller.js
    for i in $(seq 10 10 90); do
        sleep 3
        printf "\rSetup process : [%s%s] %d%%" \
            "$(printf '#%.0s' $(seq 1 $((i/2))))" \
            "$(printf ' %.0s' $(seq 1 $((50-i/2))))" \
            "$i"
        echo ""  # Force new line for better compatibility
    done
    
    # Wait for pull to complete
    wait $PULL_PID
    
    # Jalankan container
    echo "Starting Windows container..." >&2
    $COMPOSE_CMD up -d >/dev/null 2>&1
    
    if [[ $? -eq 0 ]]; then
        echo "Container started successfully!" >&2
        printf "\rSetup process : [##################################################] 100%%\n"
        echo "Installation completed successfully!" >&2
    else
        echo "Failed to start with docker-compose, trying docker run..." >&2
        
        # Fallback ke docker run
        docker run -d \
            --name windows \
            --device=/dev/kvm \
            --device=/dev/net/tun \
            --cap-add NET_ADMIN \
            -p 8006:8006 \
            -p 3389:3389/tcp \
            -p 3389:3389/udp \
            -v "${PWD}/windows:/storage" \
            -v "${PWD}/shared:/data" \
            -e VERSION="${VERSION}" \
            -e USERNAME="${USERNAME}" \
            -e PASSWORD="${PASSWORD}" \
            -e RAM_SIZE="${RAM_SIZE}" \
            -e CPU_CORES="${CPU_CORES_SET}" \
            -e DISK_SIZE="${DISK_SIZE}" \
            -e LANGUAGE="English" \
            -e REGION="en-US" \
            -e KEYBOARD="en-US" \
            --restart always \
            --stop-timeout 120 \
            dockurr/windows >/dev/null 2>&1
        
        if [[ $? -eq 0 ]]; then
            echo "Container started successfully with docker run!" >&2
            printf "\rSetup process : [##################################################] 100%%\n"
            echo "Installation completed successfully!" >&2
        else
            echo "Failed to start container!" >&2
            exit 1
        fi
    fi
}

# Fungsi untuk menampilkan informasi akses
show_access_info() {
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "YOUR_SERVER_IP")
    
    echo ""
    echo -e "${PURPLE}========================================${NC}"
    echo -e "${CYAN}       INSTALLATION COMPLETED!${NC}"
    echo -e "${PURPLE}========================================${NC}"
    echo ""
    echo -e "${WHITE}Access Information:${NC}"
    echo -e "${CYAN}Web Viewer: http://${SERVER_IP}:8006${NC}"
    echo -e "${CYAN}RDP: ${SERVER_IP}:3389${NC}"
    echo -e "${CYAN}Username: ${USERNAME}${NC}"
    echo -e "${CYAN}Password: ${PASSWORD}${NC}"
    echo ""
    echo -e "${WHITE}How to Use:${NC}"
    echo -e "${YELLOW}1. Open browser and access: http://${SERVER_IP}:8006${NC}"
    echo -e "${YELLOW}2. Wait for automatic installation to complete${NC}"
    echo -e "${YELLOW}3. After seeing desktop, Windows is ready to use${NC}"
    echo -e "${YELLOW}4. For best performance, use RDP client${NC}"
    echo ""
    echo -e "${WHITE}Monitoring:${NC}"
    echo -e "${CYAN}Status: docker logs -f windows${NC}"
    echo -e "${CYAN}Stop: docker stop windows${NC}"
    echo -e "${CYAN}Start: docker start windows${NC}"
    echo -e "${CYAN}Remove: docker rm -f windows${NC}"
    echo ""
    echo -e "${GREEN}Installation completed successfully!${NC}"
    echo -e "${GREEN}RDP Server is now running on port 3389${NC}"
    echo -e "${GREEN}Web interface available at http://${SERVER_IP}:8006${NC}"
    echo -e "${PURPLE}========================================${NC}"
    
    # Output untuk rdpInstaller.js compatibility
    echo "Installation completed successfully!" >&2
    echo "RDP Server is now running on port 3389" >&2
    echo "Web interface available at http://${SERVER_IP}:8006" >&2
}

# Main function
main() {
    # Flush output untuk immediate visibility
    exec > >(stdbuf -oL cat) 2> >(stdbuf -oL cat >&2)
    
    check_system
    
    # Cek apakah Docker sudah terinstall dan docker-compose tersedia
    if ! command -v docker &> /dev/null; then
        echo -e "${YELLOW}Docker not installed. Installing now...${NC}"
        echo "Docker not installed. Installing now..." >&2
        install_docker
        echo ""
    elif ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
        echo -e "${YELLOW}Docker Compose not installed. Installing now...${NC}"
        echo "Docker Compose not installed. Installing now..." >&2
        install_docker
        echo ""
    else
        echo -e "${GREEN}✓ Docker and Docker Compose already installed${NC}"
        echo "Docker and Docker Compose already installed" >&2
        echo ""
    fi
    
    # Gunakan input otomatis dari rdpInstaller.js
    get_automated_input
    create_compose_file
    run_container
    show_access_info
}

# Jalankan main function
main