provider "aws" {
  region = "eu-central-1"
}

# -------------------------------
# VPC
# -------------------------------
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "main-vpc"
  }
}

# -------------------------------
# Subnets
# -------------------------------
resource "aws_subnet" "db_subnet_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "eu-central-1a"

  tags = {
    Name = "subnet-a"
  }
}

resource "aws_subnet" "db_subnet_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "eu-central-1b"

  tags = {
    Name = "subnet-b"
  }
}

# -------------------------------
# Internet Gateway
# -------------------------------
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "main-igw"
  }
}

# -------------------------------
# Public Route Table
# -------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name = "public-rt"
  }
}

# -------------------------------
# Route Table Associations
# -------------------------------
resource "aws_route_table_association" "subnet_a_public" {
  subnet_id      = aws_subnet.db_subnet_1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "subnet_b_public" {
  subnet_id      = aws_subnet.db_subnet_2.id
  route_table_id = aws_route_table.public.id
}

# -------------------------------
# DB Subnet Group
# -------------------------------
resource "aws_db_subnet_group" "db_subnet_group" {
  name = "mysql-subnet-group"
  subnet_ids = [
    aws_subnet.db_subnet_1.id,
    aws_subnet.db_subnet_2.id
  ]
}

data "http" "my_ip" {
  url = "https://checkip.amazonaws.com"
}

# -------------------------------
# Security Group
# -------------------------------
resource "aws_security_group" "db_sg" {
  name   = "mysql-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    description = "Allow MySQL from my IP only"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["${chomp(data.http.my_ip.response_body)}/32"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# -------------------------------
# RDS Instance
# -------------------------------
resource "aws_db_instance" "mysql" {
  allocated_storage   = 20
  engine              = "mysql"
  engine_version      = "8.0"
  instance_class      = "db.t3.micro"
  db_name             = "mydb"
  username            = var.db_user
  password            = var.db_password
  skip_final_snapshot = true

  publicly_accessible = true

  db_subnet_group_name = aws_db_subnet_group.db_subnet_group.name

  vpc_security_group_ids = [
    aws_security_group.db_sg.id
  ]
}
