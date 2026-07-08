package com.asset.config;

import com.asset.model.User;
import com.asset.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    
    @Override
    public void run(String... args) {
        if (!userRepository.existsByUsername("admin")) {
            User admin = User.builder()
                .username("admin")
                .password(passwordEncoder.encode("admin123"))
                .role(User.Role.ADMIN)
                .email("admin@example.com")
                .build();
            userRepository.save(admin);
            System.out.println("Admin user created: admin / admin123");
        }
        
        if (!userRepository.existsByUsername("user")) {
            User user = User.builder()
                .username("user")
                .password(passwordEncoder.encode("user123"))
                .role(User.Role.USER)
                .email("user@example.com")
                .build();
            userRepository.save(user);
            System.out.println("User created: user / user123");
        }
    }
}