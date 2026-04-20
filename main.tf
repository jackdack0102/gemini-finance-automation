# 1. Create Secret in Secrets Manager to store .clasprc.json file
resource "aws_secretsmanager_secret" "clasp_auth" {
  name        = "clasp/auth/google"
  description = "Token Login Google Apps Script"
}
resource "aws_secretsmanager_secret_version" "clasp_auth_val" {
  secret_id     = aws_secretsmanager_secret.clasp_auth.id
  secret_string = var.google_auth_token
}

# 1.0 Add GitHub credentials for CodeBuild
resource "aws_codebuild_source_credential" "github" {
  auth_type   = "PERSONAL_ACCESS_TOKEN"
  server_type = "GITHUB"
  token       = var.github_token
}


#1.1 Add Instance
resource "aws_instance" "my_instance" {
  ami           = "ami-005c9e06a21d032e4"
  instance_type = "t2.micro"
  
  # Attach Instance Profile here
  iam_instance_profile = aws_iam_instance_profile.ec2_profile.name

  # This is the step to inject secret into file
  user_data = <<-EOF
              #!/bin/bash
              # Install necessary tools (ensure instance has awscli and jq)
              sudo apt-get update && sudo apt-get install -y awscli jq
              
              # Get secret from AWS and save to .clasprc.json
              aws secretsmanager get-secret-value \
                --secret-id ${aws_secretsmanager_secret.clasp_auth.name} \
                --query SecretString --output text > /home/ubuntu/.clasprc.json
              
              # Grant permissions to user (assumed to be ubuntu)
              chown ubuntu:ubuntu /home/ubuntu/.clasprc.json
              EOF
}


# 2. Create IAM Role for CodeBuild (so it has permission to access the Secret above)
resource "aws_iam_role" "codebuild_role" {
  name = "gemini_automation_codebuild_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
      }
    ]
  })
}

# 3. Grant permission to Role to read Secret
resource "aws_iam_role_policy" "codebuild_policy" {
  role = aws_iam_role.codebuild_role.name
  name = "codebuild_secret_policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = ["secretsmanager:GetSecretValue"]
        Effect   = "Allow"
        Resource = [aws_secretsmanager_secret.clasp_auth.arn]
      },
      {
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Effect   = "Allow"
        Resource = ["*"]
      }
    ]
  })
}

# 4. Create CodeBuild Project
resource "aws_codebuild_project" "gemini_deploy" {
  name          = "gemini-gas-deploy"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0" # Has Node.js pre-installed
    type                        = "LINUX_CONTAINER"
    privileged_mode             = false

    # Attach Secret to environment variable
    environment_variable {
      name  = "CLASP_AUTH"
      value = aws_secretsmanager_secret.clasp_auth.name
      type  = "SECRETS_MANAGER"
    }
  }

  source {
    type            = "GITHUB"
    location        = "https://github.com/jackdack0102/gemini-finance-automation.git"
    git_clone_depth = 1
  }

  depends_on = [aws_codebuild_source_credential.github]
}

# 4.1 Create GitHub Webhook to trigger CodeBuild on push
resource "aws_codebuild_webhook" "github_webhook" {
  project_name = aws_codebuild_project.gemini_deploy.name
  
  # Trigger on push events to main/master branch
  filter_group {
    filter {
      type                = "EVENT"
      pattern             = "PUSH"
    }
    filter {
      type                = "HEAD_REF"
      pattern             = "^(refs/heads/main|refs/heads/master)$"
      exclude_matched_pattern = false
    }
  }

  build_type = "BUILD"
}

# 5. Create Role for EC2
resource "aws_iam_role" "ec2_role" {
  name = "gemini_ec2_clasp_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

# 6. Grant permission to this Role to read specific Secret
resource "aws_iam_role_policy" "ec2_secret_policy" {
  role = aws_iam_role.ec2_role.id
  name = "ec2_secret_policy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = ["secretsmanager:GetSecretValue"]
      Effect   = "Allow"
      Resource = [aws_secretsmanager_secret.clasp_auth.arn]
    }]
  })
}

# 7. Create Instance Profile (this is used to attach to EC2)
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "gemini_ec2_profile"
  role = aws_iam_role.ec2_role.name
}

