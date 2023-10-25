CREATE TABLE ads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ad_id int(11) unique,
    title VARCHAR(255) NOT NULL,
    ad_link VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2),
    location VARCHAR(100),
    date_posted DATE,
    description_html TEXT,
    dealer_updates TEXT,
    imageSrc VARCHAR(255)
);

CREATE TABLE options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    value TEXT,
    UNIQUE (name)
);

CREATE TABLE conversations(
    id INT AUTO_INCREMENT PRIMARY KEY,
    ad_id INT unique,
    conv_data TEXT,
    ad_details TEXT,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat(
    id INT AUTO_INCREMENT PRIMARY KEY,
    dealer_name varchar(190),
    sender varchar(10),
    conv_message TEXT,
    conversations_id INT NOT NULL,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversations_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE messages_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url VARCHAR(255) NOT NULL,
    isSent INT DEFAULT 0 NOT NULL,
    creation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);